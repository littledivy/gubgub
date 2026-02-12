package main

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/chromedp/cdproto/page"
	"github.com/chromedp/chromedp"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type Storage interface {
	Put(ctx context.Context, key string, localPath string) error
	GetURL(ctx context.Context, key string) (string, error)
	Download(ctx context.Context, key string, localPath string) error
	Delete(ctx context.Context, key string) error
}

type LocalStorage struct {
	baseDir string
}

func NewLocalStorage(baseDir string) *LocalStorage {
	return &LocalStorage{baseDir: baseDir}
}

func (s *LocalStorage) Put(ctx context.Context, key string, localPath string) error {
	return nil
}

func (s *LocalStorage) GetURL(ctx context.Context, key string) (string, error) {
	return "", nil
}

func (s *LocalStorage) Download(ctx context.Context, key string, localPath string) error {
	src := filepath.Join(s.baseDir, filepath.Base(key))
	if src == localPath {
		return nil
	}
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(localPath)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
}

func (s *LocalStorage) Delete(ctx context.Context, key string) error {
	return os.Remove(filepath.Join(s.baseDir, filepath.Base(key)))
}

type S3Storage struct {
	client *minio.Client
	bucket string
}

func NewS3Storage(endpoint, accessKey, secretKey, bucket, region string) (*S3Storage, error) {
	useSSL := strings.HasPrefix(endpoint, "https://")
	endpoint = strings.TrimPrefix(strings.TrimPrefix(endpoint, "https://"), "http://")

	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
		Region: region,
	})
	if err != nil {
		return nil, fmt.Errorf("create s3 client: %w", err)
	}

	return &S3Storage{client: client, bucket: bucket}, nil
}

func (s *S3Storage) Put(ctx context.Context, key string, localPath string) error {
	f, err := os.Open(localPath)
	if err != nil {
		return fmt.Errorf("open file for upload: %w", err)
	}
	defer f.Close()

	fi, err := f.Stat()
	if err != nil {
		return fmt.Errorf("stat file for upload: %w", err)
	}

	contentType := "application/octet-stream"
	if strings.HasSuffix(key, ".webm") {
		contentType = "video/webm"
	} else if strings.HasSuffix(key, ".wav") {
		contentType = "audio/wav"
	}

	_, err = s.client.PutObject(ctx, s.bucket, key, f, fi.Size(), minio.PutObjectOptions{
		ContentType: contentType,
	})
	if err != nil {
		return fmt.Errorf("upload to s3: %w", err)
	}
	log.Printf("storage: uploaded %s (%d bytes)", key, fi.Size())
	return nil
}

func (s *S3Storage) GetURL(ctx context.Context, key string) (string, error) {
	url, err := s.client.PresignedGetObject(ctx, s.bucket, key, 1*time.Hour, nil)
	if err != nil {
		return "", fmt.Errorf("presign url: %w", err)
	}
	return url.String(), nil
}

func (s *S3Storage) Download(ctx context.Context, key string, localPath string) error {
	return s.client.FGetObject(ctx, s.bucket, key, localPath, minio.GetObjectOptions{})
}

func (s *S3Storage) Delete(ctx context.Context, key string) error {
	return s.client.RemoveObject(ctx, s.bucket, key, minio.RemoveObjectOptions{})
}

func initStorage(recordingsDir string) Storage {
	storageType := os.Getenv("STORAGE_TYPE")
	if storageType == "s3" {
		s, err := NewS3Storage(
			os.Getenv("S3_ENDPOINT"),
			os.Getenv("S3_ACCESS_KEY"),
			os.Getenv("S3_SECRET_KEY"),
			os.Getenv("S3_BUCKET"),
			getEnv("S3_REGION", "auto"),
		)
		if err != nil {
			log.Fatalf("Failed to initialize S3 storage: %v", err)
		}
		log.Println("storage: using S3")
		return s
	}
	log.Println("storage: using local filesystem")
	return NewLocalStorage(recordingsDir)
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

type Bot struct {
	cancel context.CancelFunc
	ctx    context.Context
}

type botConfig struct {
	userDataDir string
	headless    bool
	chromePath  string
}

type Option func(*botConfig)

func WithUserDataDir(dir string) Option { return func(c *botConfig) { c.userDataDir = dir } }
func WithHeadless(h bool) Option        { return func(c *botConfig) { c.headless = h } }
func WithChromePath(p string) Option    { return func(c *botConfig) { c.chromePath = p } }

func findChrome() string {
	if p := os.Getenv("CHROME_PATH"); p != "" {
		return p
	}
	candidates := []string{
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
		"/Applications/Nix Apps/Google Chrome.app/Contents/MacOS/Google Chrome",
		"/Applications/Chromium.app/Contents/MacOS/Chromium",
		"/usr/bin/chromium",
		"/usr/bin/chromium-browser",
		"/usr/bin/google-chrome",
		"/usr/bin/google-chrome-stable",
	}
	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			return c
		}
	}
	return ""
}

func NewBot(opts ...Option) (*Bot, error) {
	cfg := &botConfig{
		headless: os.Getenv("HEADLESS") == "true",
	}
	for _, o := range opts {
		o(cfg)
	}

	chromePath := cfg.chromePath
	if chromePath == "" {
		chromePath = findChrome()
	}
	if chromePath == "" {
		return nil, fmt.Errorf("chrome/chromium not found; set CHROME_PATH env var")
	}
	log.Printf("bot: using chrome at %s", chromePath)

	userDataDir := cfg.userDataDir
	if userDataDir == "" {
		userDataDir = os.Getenv("CHROME_USER_DATA_DIR")
	}
	if userDataDir == "" {
		userDataDir = "./data/chrome-profile"
	}
	os.MkdirAll(userDataDir, 0755)
	log.Printf("bot: using chrome profile at %s", userDataDir)

	allocOpts := []chromedp.ExecAllocatorOption{
		chromedp.ExecPath(chromePath),
		chromedp.NoFirstRun,
		chromedp.NoDefaultBrowserCheck,
		chromedp.UserDataDir(userDataDir),
		chromedp.Flag("headless", cfg.headless),
		chromedp.Flag("disable-blink-features", "AutomationControlled"),
		chromedp.Flag("disable-background-networking", true),
		chromedp.Flag("disable-background-timer-throttling", true),
		chromedp.Flag("disable-backgrounding-occluded-windows", true),
		chromedp.Flag("disable-breakpad", true),
		chromedp.Flag("disable-component-extensions-with-background-pages", true),
		chromedp.Flag("disable-component-update", true),
		chromedp.Flag("disable-default-apps", true),
		chromedp.Flag("disable-dev-shm-usage", true),
		chromedp.Flag("disable-extensions", true),
		chromedp.Flag("disable-features", "TranslateUI"),
		chromedp.Flag("disable-hang-monitor", true),
		chromedp.Flag("disable-ipc-flooding-protection", true),
		chromedp.Flag("disable-popup-blocking", true),
		chromedp.Flag("disable-prompt-on-repost", true),
		chromedp.Flag("disable-renderer-backgrounding", true),
		chromedp.Flag("disable-sync", true),
		chromedp.Flag("metrics-recording-only", true),
		chromedp.Flag("no-first-run", true),
		chromedp.Flag("password-store", "basic"),
		chromedp.Flag("use-mock-keychain", true),
		chromedp.Flag("safebrowsing-disable-auto-update", true),
		chromedp.Flag("use-fake-ui-for-media-stream", true),
		chromedp.Flag("autoplay-policy", "no-user-gesture-required"),
		chromedp.Flag("disable-notifications", true),
		chromedp.Flag("disable-infobars", true),
		chromedp.Flag("no-sandbox", true),
		chromedp.Flag("disable-gpu", true),
		chromedp.WindowSize(1280, 900),
	}

	allocCtx, allocCancel := chromedp.NewExecAllocator(context.Background(), allocOpts...)
	ctx, cancel := chromedp.NewContext(allocCtx)

	return &Bot{
		cancel: func() {
			cancel()
			allocCancel()
		},
		ctx: ctx,
	}, nil
}

func (b *Bot) Close() {
	if b.cancel != nil {
		b.cancel()
	}
}

func (b *Bot) Context() context.Context {
	return b.ctx
}

//go:embed webrtc_hook.js
var webrtcHookJS string

type Recorder struct {
	bot       *Bot
	outputDir string
	stopCh    chan struct{}
}

func NewRecorder(bot *Bot, outputDir string) *Recorder {
	return &Recorder{
		bot:       bot,
		outputDir: outputDir,
		stopCh:    make(chan struct{}),
	}
}

func (r *Recorder) Stop() {
	select {
	case r.stopCh <- struct{}{}:
	default:
	}
}

func (r *Recorder) InjectHook() error {
	return chromedp.Run(r.bot.ctx,
		chromedp.ActionFunc(func(ctx context.Context) error {
			_, err := page.AddScriptToEvaluateOnNewDocument(webrtcHookJS).Do(ctx)
			return err
		}),
	)
}

type RecordResult struct {
	WebmPath string
	WavPath  string
}

func (r *Recorder) Record(ctx context.Context, meetingID string) (*RecordResult, error) {
	log.Println("recorder: starting recording")
	chromedp.Run(r.bot.ctx, chromedp.Evaluate(`
		if (window._gubgubStartRecording) window._gubgubStartRecording();
	`, nil))

	pollCtx, pollCancel := context.WithTimeout(ctx, 30*time.Second)
	defer pollCancel()

	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-pollCtx.Done():
			log.Println("recorder: timed out waiting for recording to start, continuing anyway")
			goto recording
		case <-ticker.C:
			var recording bool
			chromedp.Run(r.bot.ctx, chromedp.Evaluate(`window._gubgubRecording === true`, &recording))
			if recording {
				log.Println("recorder: recording active")
				goto recording
			}
			var trackCount int
			chromedp.Run(r.bot.ctx, chromedp.Evaluate(`window._gubgubTracks ? window._gubgubTracks.length : 0`, &trackCount))
			log.Printf("recorder: waiting for recording to start... %d tracks so far", trackCount)
		}
	}

recording:
	log.Println("recorder: recording in progress, draining chunks")

	webmPath := filepath.Join(r.outputDir, meetingID+".webm")
	wavPath := filepath.Join(r.outputDir, meetingID+".wav")

	f, err := os.Create(webmPath)
	if err != nil {
		return nil, fmt.Errorf("create webm file: %w", err)
	}

	totalChunks := 0
	drainTicker := time.NewTicker(2 * time.Second)
	defer drainTicker.Stop()

	debugCount := 0
	drainChunks := func() {
		var count int
		if err := chromedp.Run(r.bot.ctx, chromedp.Evaluate(
			`window._gubgubChunks ? window._gubgubChunks.length : -1`, &count,
		)); err != nil {
			log.Printf("recorder: drain check error: %v", err)
			return
		}
		debugCount++
		if debugCount%5 == 1 || count > 0 {
			var debug string
			chromedp.Run(r.bot.ctx, chromedp.Evaluate(`
				(function() {
					var r = window._gubgubRecorder;
					var s = window._gubgubStream;
					var tracks = window._gubgubTracks || [];
					return 'recorder=' + (r ? r.state : 'null') +
						' stream_tracks=' + (s ? s.getTracks().length : 0) +
						' captured_tracks=' + tracks.length +
						' chunks=' + (window._gubgubChunks ? window._gubgubChunks.length : 'null') +
						' recording=' + window._gubgubRecording;
				})()
			`, &debug))
			log.Printf("recorder: debug: %s", debug)
		}
		if count <= 0 {
			return
		}
		log.Printf("recorder: draining %d chunks", count)
		for i := 0; i < count; i++ {
			var b64 string
			if err := chromedp.Run(r.bot.ctx, chromedp.Evaluate(
				`window._gubgubChunks.shift() || ""`, &b64,
			)); err != nil || b64 == "" {
				continue
			}
			data, decErr := base64.StdEncoding.DecodeString(b64)
			if decErr != nil {
				log.Printf("recorder: chunk decode error: %v", decErr)
				continue
			}
			f.Write(data)
			totalChunks++
		}
		log.Printf("recorder: drained, %d total chunks saved", totalChunks)
	}

drainLoop:
	for {
		select {
		case <-ctx.Done():
			break drainLoop
		case <-r.stopCh:
			break drainLoop
		case <-drainTicker.C:
			drainChunks()
		}
	}

	log.Println("recorder: stopping recording, final drain")

	chromedp.Run(r.bot.ctx, chromedp.Evaluate(`
		if (window._gubgubRecorder && window._gubgubRecorder.state !== 'inactive') {
			window._gubgubRecorder.stop();
		}
	`, nil))
	time.Sleep(1 * time.Second)

	drainChunks()
	f.Close()

	if totalChunks == 0 {
		return nil, fmt.Errorf("no audio/video data captured")
	}

	fi, _ := os.Stat(webmPath)
	log.Printf("recorder: saved webm (%d bytes, %d chunks)", fi.Size(), totalChunks)

	log.Println("recorder: converting to wav for transcription")
	convCtx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	cmd := exec.CommandContext(convCtx, "ffmpeg", "-y",
		"-i", webmPath,
		"-vn",
		"-ac", "1",
		"-ar", "16000",
		"-sample_fmt", "s16",
		wavPath,
	)
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("ffmpeg convert: %w", err)
	}

	log.Printf("recorder: saved wav for transcription, keeping webm for video playback")
	return &RecordResult{WebmPath: webmPath, WavPath: wavPath}, nil
}

type SessionStatus string

const (
	StatusCreated          SessionStatus = "created"
	StatusJoining          SessionStatus = "joining"
	StatusWaitingAdmission SessionStatus = "waiting_admission"
	StatusRecording        SessionStatus = "recording"
	StatusFinalizing       SessionStatus = "finalizing"
	StatusEnded            SessionStatus = "ended"
	StatusStopped          SessionStatus = "stopped"
	StatusFailed           SessionStatus = "failed"
	StatusLoginOpen        SessionStatus = "login_open"
)

type Session struct {
	mu           sync.RWMutex
	ID           string
	status       SessionStatus
	Error        string
	Bot          *Bot
	Recorder     *Recorder
	RecordCancel context.CancelFunc
	WebmPath     string
	WavPath      string
	ProfileDir   string
	CreatedAt    time.Time
}

func (s *Session) Status() SessionStatus {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.status
}

func (s *Session) SetStatus(st SessionStatus) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.status = st
	log.Printf("session %s: status -> %s", s.ID, st)
}

func (s *Session) SetError(err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.status = StatusFailed
	s.Error = err.Error()
	log.Printf("session %s: failed: %v", s.ID, err)
}

func (s *Session) SetResult(webm, wav string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.WebmPath = webm
	s.WavPath = wav
}

func (s *Session) Info() map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()
	info := map[string]interface{}{
		"session_id": s.ID,
		"status":     string(s.status),
	}
	if s.WebmPath != "" {
		info["webm_path"] = s.WebmPath
	}
	if s.WavPath != "" {
		info["wav_path"] = s.WavPath
	}
	if s.Error != "" {
		info["error"] = s.Error
	}
	return info
}

type Manager struct {
	mu            sync.RWMutex
	sessions      map[string]*Session
	recordingsDir string
	profilesDir   string
	chromePath    string
	headless      bool
	storage       Storage
}

func NewManager(recordingsDir, profilesDir, chromePath string, headless bool, storage Storage) *Manager {
	os.MkdirAll(recordingsDir, 0755)
	os.MkdirAll(profilesDir, 0755)
	return &Manager{
		sessions:      make(map[string]*Session),
		recordingsDir: recordingsDir,
		profilesDir:   profilesDir,
		chromePath:    chromePath,
		headless:      headless,
		storage:       storage,
	}
}

func (m *Manager) Create(sessionID string) (*Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.sessions[sessionID]; exists {
		return nil, fmt.Errorf("session %s already exists", sessionID)
	}

	profileDir := fmt.Sprintf("%s/%s", m.profilesDir, sessionID)

	defaultProfile := fmt.Sprintf("%s/default", m.profilesDir)
	if info, err := os.Stat(defaultProfile); err == nil && info.IsDir() {
		log.Printf("session %s: copying default profile cookies", sessionID)
		os.MkdirAll(profileDir, 0755)
		for _, name := range []string{"Cookies", "Cookies-journal", "Login Data", "Login Data-journal"} {
			src := fmt.Sprintf("%s/Default/%s", defaultProfile, name)
			if _, err := os.Stat(src); err == nil {
				dst := fmt.Sprintf("%s/Default/%s", profileDir, name)
				os.MkdirAll(fmt.Sprintf("%s/Default", profileDir), 0755)
				data, err := os.ReadFile(src)
				if err == nil {
					os.WriteFile(dst, data, 0644)
				}
			}
		}
	}

	opts := []Option{
		WithUserDataDir(profileDir),
		WithHeadless(m.headless),
	}
	if m.chromePath != "" {
		opts = append(opts, WithChromePath(m.chromePath))
	}

	meetBot, err := NewBot(opts...)
	if err != nil {
		return nil, fmt.Errorf("create bot: %w", err)
	}

	recorder := NewRecorder(meetBot, m.recordingsDir)
	if err := recorder.InjectHook(); err != nil {
		log.Printf("session %s: hook injection warning: %v", sessionID, err)
	}

	sess := &Session{
		ID:         sessionID,
		status:     StatusCreated,
		Bot:        meetBot,
		Recorder:   recorder,
		ProfileDir: profileDir,
		CreatedAt:  time.Now(),
	}

	m.sessions[sessionID] = sess
	log.Printf("session %s: created (profile: %s)", sessionID, profileDir)
	return sess, nil
}

func (m *Manager) Get(sessionID string) *Session {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.sessions[sessionID]
}

func (m *Manager) Delete(sessionID string) {
	m.mu.Lock()
	sess, exists := m.sessions[sessionID]
	if exists {
		delete(m.sessions, sessionID)
	}
	m.mu.Unlock()

	if !exists {
		return
	}

	if sess.Bot != nil {
		sess.Bot.Close()
	}

	if sess.ProfileDir != "" && sess.ProfileDir != fmt.Sprintf("%s/default", m.profilesDir) {
		os.RemoveAll(sess.ProfileDir)
		log.Printf("session %s: cleaned up profile dir", sessionID)
	}
}

func (m *Manager) ActiveCount() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.sessions)
}

type JoinRequest struct {
	MeetURL        string `json:"meet_url"`
	DisplayName    string `json:"display_name"`
	AuthMode       string `json:"auth_mode"`
	GoogleEmail    string `json:"google_email,omitempty"`
	GooglePassword string `json:"google_password,omitempty"`
}

func (m *Manager) Join(sessionID string, req JoinRequest) error {
	sess := m.Get(sessionID)
	if sess == nil {
		return fmt.Errorf("session %s not found", sessionID)
	}

	go m.runLifecycle(sess, req)
	return nil
}

func (m *Manager) runLifecycle(sess *Session, req JoinRequest) {
	sess.SetStatus(StatusJoining)

	if req.AuthMode == "account" {
		if err := sess.Bot.JoinWithAccount(req.MeetURL, req.GoogleEmail, req.GooglePassword); err != nil {
			sess.SetError(fmt.Errorf("join with account: %w", err))
			return
		}
	} else {
		name := req.DisplayName
		if name == "" {
			name = "gubgub"
		}
		if err := sess.Bot.JoinMeeting(req.MeetURL, name); err != nil {
			sess.SetError(fmt.Errorf("join meeting: %w", err))
			return
		}
	}

	sess.SetStatus(StatusWaitingAdmission)
	if err := sess.Bot.WaitUntilJoined(2 * time.Minute); err != nil {
		sess.SetError(err)
		return
	}

	sess.SetStatus(StatusRecording)

	recordCtx, recordCancel := context.WithCancel(context.Background())
	sess.mu.Lock()
	sess.RecordCancel = recordCancel
	sess.mu.Unlock()

	recordingDone := make(chan struct{})
	var recordResult *RecordResult
	var recordErr error

	go func() {
		recordResult, recordErr = sess.Recorder.Record(recordCtx, sess.ID)
		close(recordingDone)
	}()

	go func() {
		sess.Bot.WaitForMeetingEnd(recordCtx)
		recordCancel()
	}()

	<-recordingDone

	if recordErr != nil {
		sess.SetError(fmt.Errorf("recording: %w", recordErr))
		return
	}

	sess.SetStatus(StatusFinalizing)

	webmKey := "recordings/" + sess.ID + ".webm"
	wavKey := "recordings/" + sess.ID + ".wav"

	if err := m.storage.Put(context.Background(), webmKey, recordResult.WebmPath); err != nil {
		sess.SetError(fmt.Errorf("upload webm: %w", err))
		return
	}
	if err := m.storage.Put(context.Background(), wavKey, recordResult.WavPath); err != nil {
		sess.SetError(fmt.Errorf("upload wav: %w", err))
		return
	}

	if _, isS3 := m.storage.(*S3Storage); isS3 {
		os.Remove(recordResult.WebmPath)
		os.Remove(recordResult.WavPath)
	}

	sess.SetResult(webmKey, wavKey)
	sess.SetStatus(StatusEnded)

	sess.Bot.Close()
}

func (m *Manager) Stop(sessionID string) error {
	sess := m.Get(sessionID)
	if sess == nil {
		return fmt.Errorf("session %s not found", sessionID)
	}

	sess.mu.RLock()
	cancel := sess.RecordCancel
	sess.mu.RUnlock()

	if cancel != nil {
		cancel()
	}
	sess.Recorder.Stop()

	time.Sleep(3 * time.Second)

	sess.mu.Lock()
	if sess.status == StatusRecording || sess.status == StatusFinalizing {
		sess.status = StatusStopped
	}
	sess.mu.Unlock()

	return nil
}

func (m *Manager) CreateLogin(sessionID, profileName string) (*Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.sessions[sessionID]; exists {
		return nil, fmt.Errorf("session %s already exists", sessionID)
	}

	profileDir := fmt.Sprintf("%s/%s", m.profilesDir, profileName)

	meetBot, err := NewBot(
		WithUserDataDir(profileDir),
		WithHeadless(false),
	)
	if err != nil {
		return nil, fmt.Errorf("create bot for login: %w", err)
	}

	sess := &Session{
		ID:         sessionID,
		status:     StatusLoginOpen,
		Bot:        meetBot,
		ProfileDir: profileDir,
		CreatedAt:  time.Now(),
	}

	m.sessions[sessionID] = sess
	log.Printf("session %s: login window opened (profile: %s)", sessionID, profileDir)
	return sess, nil
}

func writeJSON(w http.ResponseWriter, code int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

func handleHealth(mgr *Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, map[string]interface{}{
			"status":          "ok",
			"active_sessions": mgr.ActiveCount(),
		})
	}
}

func handleCreateSession(mgr *Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			SessionID string `json:"session_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, 400, map[string]string{"error": "invalid request body"})
			return
		}
		if req.SessionID == "" {
			writeJSON(w, 400, map[string]string{"error": "session_id is required"})
			return
		}

		sess, err := mgr.Create(req.SessionID)
		if err != nil {
			writeJSON(w, 409, map[string]string{"error": err.Error()})
			return
		}

		writeJSON(w, 201, sess.Info())
	}
}

func handleGetSession(mgr *Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		sess := mgr.Get(id)
		if sess == nil {
			writeJSON(w, 404, map[string]string{"error": "session not found"})
			return
		}
		writeJSON(w, 200, sess.Info())
	}
}

func handleJoinSession(mgr *Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")

		var req JoinRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, 400, map[string]string{"error": "invalid request body"})
			return
		}

		if err := mgr.Join(id, req); err != nil {
			writeJSON(w, 404, map[string]string{"error": err.Error()})
			return
		}

		sess := mgr.Get(id)
		writeJSON(w, 200, sess.Info())
	}
}

func handleStopSession(mgr *Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")

		if err := mgr.Stop(id); err != nil {
			writeJSON(w, 404, map[string]string{"error": err.Error()})
			return
		}

		sess := mgr.Get(id)
		if sess != nil {
			writeJSON(w, 200, sess.Info())
		} else {
			writeJSON(w, 200, map[string]string{"status": "stopped"})
		}
	}
}

func handleDeleteSession(mgr *Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		mgr.Delete(id)
		writeJSON(w, 200, map[string]string{"status": "deleted"})
	}
}

type TranscribeRequest struct {
	Provider string `json:"provider"`
}

type TranscribeResponse struct {
	Text     string `json:"text"`
	Segments string `json:"segments"`
	Language string `json:"language"`
}

func transcribeWhisper(bin, model, wavPath string) (TranscribeResponse, error) {
	jsonOut := strings.TrimSuffix(wavPath, filepath.Ext(wavPath))

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	log.Printf("transcribe: running %s -m %s -f %s", bin, model, wavPath)
	var stderr bytes.Buffer
	cmd := exec.CommandContext(ctx, bin, "-m", model, "-f", wavPath, "-oj", "-of", jsonOut, "--no-prints")
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return TranscribeResponse{}, fmt.Errorf("whisper command: %w; stderr: %s", err, stderr.String())
	}

	jsonPath := jsonOut + ".json"
	data, err := os.ReadFile(jsonPath)
	if err != nil {
		return TranscribeResponse{}, fmt.Errorf("read whisper output: %w", err)
	}
	defer os.Remove(jsonPath)

	type whisperOutput struct {
		Transcription []struct {
			Timestamps struct {
				From string `json:"from"`
				To   string `json:"to"`
			} `json:"timestamps"`
			Text string `json:"text"`
		} `json:"transcription"`
	}

	var wo whisperOutput
	if err := json.Unmarshal(data, &wo); err != nil {
		return TranscribeResponse{}, fmt.Errorf("parse whisper output: %w", err)
	}

	var fullText string
	type segment struct {
		Start string `json:"start"`
		Text  string `json:"text"`
	}
	var segments []segment

	for _, t := range wo.Transcription {
		fullText += t.Text
		segments = append(segments, segment{Start: t.Timestamps.From, Text: t.Text})
	}

	segJSON, _ := json.Marshal(segments)
	return TranscribeResponse{
		Text:     strings.TrimSpace(fullText),
		Segments: string(segJSON),
		Language: "en",
	}, nil
}

func transcribeOpenAI(baseURL, apiKey, model, wavPath string) (TranscribeResponse, error) {
	wavData, err := os.ReadFile(wavPath)
	if err != nil {
		return TranscribeResponse{}, fmt.Errorf("read wav file: %w", err)
	}

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	part, err := writer.CreateFormFile("file", filepath.Base(wavPath))
	if err != nil {
		return TranscribeResponse{}, fmt.Errorf("create form file: %w", err)
	}
	part.Write(wavData)

	writer.WriteField("model", model)
	writer.WriteField("response_format", "verbose_json")
	writer.Close()

	url := strings.TrimRight(baseURL, "/") + "/v1/audio/transcriptions"

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "POST", url, &body)
	if err != nil {
		return TranscribeResponse{}, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return TranscribeResponse{}, fmt.Errorf("openai request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return TranscribeResponse{}, fmt.Errorf("read response: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return TranscribeResponse{}, fmt.Errorf("openai returned %d: %s", resp.StatusCode, string(respBody))
	}

	type openaiTranscribeResp struct {
		Text     string `json:"text"`
		Language string `json:"language"`
		Segments []struct {
			Start float64 `json:"start"`
			End   float64 `json:"end"`
			Text  string  `json:"text"`
		} `json:"segments"`
	}

	var oResp openaiTranscribeResp
	if err := json.Unmarshal(respBody, &oResp); err != nil {
		return TranscribeResponse{}, fmt.Errorf("parse openai response: %w", err)
	}

	type segment struct {
		Start float64 `json:"start"`
		End   float64 `json:"end"`
		Text  string  `json:"text"`
	}
	var segments []segment
	for _, s := range oResp.Segments {
		segments = append(segments, segment{Start: s.Start, End: s.End, Text: s.Text})
	}

	segJSON, _ := json.Marshal(segments)
	return TranscribeResponse{
		Text:     oResp.Text,
		Segments: string(segJSON),
		Language: oResp.Language,
	}, nil
}

func handleTranscribe(mgr *Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")

		var req TranscribeRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, 400, map[string]string{"error": "invalid request body"})
			return
		}

		wavPath := filepath.Join(mgr.recordingsDir, id+".wav")
		if _, err := os.Stat(wavPath); os.IsNotExist(err) {
			if dlErr := mgr.storage.Download(r.Context(), "recordings/"+id+".wav", wavPath); dlErr != nil {
				writeJSON(w, 404, map[string]string{"error": "wav file not found: " + dlErr.Error()})
				return
			}
		}

		var result TranscribeResponse
		var err error

		switch req.Provider {
		case "openai":
			result, err = transcribeOpenAI(
				getEnv("OPENAI_TRANSCRIPTION_URL", "https://api.openai.com"),
				os.Getenv("OPENAI_API_KEY"),
				getEnv("OPENAI_TRANSCRIPTION_MODEL", "whisper-1"),
				wavPath,
			)
		default:
			result, err = transcribeWhisper(
				getEnv("WHISPER_BIN", "whisper-cli"),
				getEnv("WHISPER_MODEL", "./data/models/ggml-base.bin"),
				wavPath,
			)
		}

		if err != nil {
			writeJSON(w, 500, map[string]string{"error": err.Error()})
			return
		}

		writeJSON(w, 200, result)
	}
}

func handleLogin(mgr *Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")

		var req struct {
			ProfileName string `json:"profile_name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			req.ProfileName = "default"
		}
		if req.ProfileName == "" {
			req.ProfileName = "default"
		}

		sess, err := mgr.CreateLogin(id, req.ProfileName)
		if err != nil {
			writeJSON(w, 500, map[string]string{"error": err.Error()})
			return
		}

		writeJSON(w, 200, sess.Info())
	}
}

func main() {
	port := 8089
	if p := os.Getenv("PORT"); p != "" {
		if v, err := strconv.Atoi(p); err == nil {
			port = v
		}
	}

	recordingsDir := os.Getenv("RECORDINGS_DIR")
	if recordingsDir == "" {
		recordingsDir = "./data/recordings"
	}

	profilesDir := os.Getenv("PROFILES_DIR")
	if profilesDir == "" {
		profilesDir = "./data/chrome-profiles"
	}

	chromePath := os.Getenv("CHROME_PATH")
	headless := os.Getenv("HEADLESS") == "true"

	storage := initStorage(recordingsDir)

	mgr := NewManager(recordingsDir, profilesDir, chromePath, headless, storage)

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins: []string{"*"},
		AllowedMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders: []string{"Accept", "Content-Type"},
	}))

	r.Route("/api", func(r chi.Router) {
		r.Get("/health", handleHealth(mgr))

		r.Route("/sessions", func(r chi.Router) {
			r.Post("/", handleCreateSession(mgr))
			r.Get("/{id}", handleGetSession(mgr))
			r.Post("/{id}/join", handleJoinSession(mgr))
			r.Post("/{id}/stop", handleStopSession(mgr))
			r.Delete("/{id}", handleDeleteSession(mgr))
			r.Post("/{id}/login", handleLogin(mgr))
			r.Post("/{id}/transcribe", handleTranscribe(mgr))
		})
	})

	addr := fmt.Sprintf(":%d", port)
	log.Printf("Worker starting on %s", addr)
	if err := http.ListenAndServe(addr, r); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}
