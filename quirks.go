package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/chromedp/chromedp"
)

type AuthConfig struct {
	Email    string
	Password string
}

func (b *Bot) JoinMeeting(meetURL, displayName string) error {
	log.Printf("bot: joining meeting %s as %s", meetURL, displayName)

	err := chromedp.Run(b.ctx,
		chromedp.Navigate(meetURL),
		chromedp.Sleep(5*time.Second),
	)
	if err != nil {
		return fmt.Errorf("navigate to meet: %w", err)
	}

	var title string
	chromedp.Run(b.ctx, chromedp.Title(&title))
	log.Printf("bot: page title: %s", title)

	if displayName != "" {
		var nameVisible bool
		chromedp.Run(b.ctx, chromedp.Evaluate(`!!document.querySelector('input[aria-label="Your name"]')`, &nameVisible))
		if nameVisible {
			log.Println("bot: name field found, entering display name")
			chromedp.Run(b.ctx,
				chromedp.Clear(`input[aria-label="Your name"]`, chromedp.ByQuery),
				chromedp.SendKeys(`input[aria-label="Your name"]`, displayName, chromedp.ByQuery),
				chromedp.Sleep(1*time.Second),
			)
		} else {
			log.Println("bot: no name field (probably logged in), skipping")
		}
	}

	b.muteMicAndCamera()

	if err := b.clickJoinButton(); err != nil {
		return fmt.Errorf("click join: %w", err)
	}

	log.Println("bot: join request sent, waiting to be admitted")
	return nil
}

func (b *Bot) muteMicAndCamera() {
	chromedp.Run(b.ctx,
		chromedp.Click(`[aria-label*="microphone"]`, chromedp.ByQuery),
		chromedp.Sleep(500*time.Millisecond),
	)
	chromedp.Run(b.ctx,
		chromedp.Click(`[aria-label*="camera"]`, chromedp.ByQuery),
		chromedp.Sleep(500*time.Millisecond),
	)
}

func (b *Bot) clickJoinButton() error {
	var buttons string
	chromedp.Run(b.ctx, chromedp.Evaluate(`
		Array.from(document.querySelectorAll('button')).map(b =>
			b.innerText.trim() + ' | jsname=' + (b.getAttribute('jsname')||'') + ' | aria=' + (b.getAttribute('aria-label')||'')
		).join('\n')
	`, &buttons))
	log.Printf("bot: buttons on page:\n%s", buttons)

	cssSelectors := []string{
		`button[jsname="Qx7uuf"]`,
		`[data-mdc-dialog-action="join"]`,
		`button[aria-label="Ask to join"]`,
		`button[aria-label="Join now"]`,
	}
	for _, sel := range cssSelectors {
		ctx, cancel := context.WithTimeout(b.ctx, 3*time.Second)
		err := chromedp.Run(ctx, chromedp.Click(sel, chromedp.ByQuery))
		cancel()
		if err == nil {
			log.Printf("bot: clicked join button: %s", sel)
			return nil
		}
	}

	xpathSelectors := []string{
		`//button[contains(., "Ask to join")]`,
		`//button[contains(., "Join now")]`,
		`//button[contains(., "Join")]`,
		`//span[contains(text(),"Ask to join")]/ancestor::button`,
		`//span[contains(text(),"Join now")]/ancestor::button`,
		`//span[contains(text(),"Join")]/ancestor::button`,
	}
	for _, sel := range xpathSelectors {
		ctx, cancel := context.WithTimeout(b.ctx, 3*time.Second)
		err := chromedp.Run(ctx, chromedp.Click(sel, chromedp.BySearch))
		cancel()
		if err == nil {
			log.Printf("bot: clicked join button (xpath): %s", sel)
			return nil
		}
	}

	var clicked bool
	chromedp.Run(b.ctx, chromedp.Evaluate(`
		(function() {
			const btns = Array.from(document.querySelectorAll('button'));
			for (const btn of btns) {
				const text = btn.innerText.toLowerCase().trim();
				if (text === 'join now' || text === 'ask to join' || text === 'join') {
					btn.click();
					return true;
				}
			}
			return false;
		})()
	`, &clicked))
	if clicked {
		log.Println("bot: clicked join button via JS")
		return nil
	}

	return fmt.Errorf("could not find join button")
}

func (b *Bot) WaitForMeetingEnd(ctx context.Context) {
	select {
	case <-ctx.Done():
		return
	case <-time.After(10 * time.Second):
	}

	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()

	aloneCount := 0
	const aloneThreshold = 5

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			var textEnded bool
			err := chromedp.Run(b.ctx,
				chromedp.Evaluate(`
					(function() {
						var body = document.body ? document.body.innerText : '';
						return (body.includes('You left the meeting') || body.includes('Meeting ended') || body.includes('Return to home screen') || body.includes('removed from the meeting') || body.includes('You were removed'));
					})()
				`, &textEnded),
			)
			if err != nil {
				log.Printf("bot: error checking meeting status: %v", err)
				continue
			}
			if textEnded {
				log.Println("bot: meeting ended (end screen detected)")
				return
			}

			var participantCount int
			err = chromedp.Run(b.ctx,
				chromedp.Evaluate(`
					(function() {
						var parts = document.querySelectorAll('[data-participant-id]');
						if (parts.length > 0) return parts.length;
						parts = document.querySelectorAll('[data-self-name]');
						var total = parts.length;
						var listItems = document.querySelectorAll('[role="listitem"][data-participant-id]');
						if (listItems.length > total) total = listItems.length;
						return total;
					})()
				`, &participantCount),
			)
			if err != nil {
				log.Printf("bot: error checking participant count: %v", err)
				continue
			}

			if participantCount <= 1 {
				aloneCount++
				if aloneCount >= aloneThreshold {
					log.Printf("bot: meeting ended (alone for %d consecutive checks, participants=%d)", aloneCount, participantCount)
					return
				}
				log.Printf("bot: alone check %d/%d (participants=%d)", aloneCount, aloneThreshold, participantCount)
			} else {
				if aloneCount > 0 {
					log.Printf("bot: alone check reset (participants=%d)", participantCount)
				}
				aloneCount = 0
			}
		}
	}
}

func (b *Bot) JoinWithAccount(meetURL, email, password string) error {
	log.Printf("bot: logging into Google as %s", email)

	err := chromedp.Run(b.ctx,
		chromedp.Navigate("https://accounts.google.com/signin"),
		chromedp.Sleep(2*time.Second),
		chromedp.WaitVisible(`input[type="email"]`, chromedp.ByQuery),
		chromedp.SendKeys(`input[type="email"]`, email, chromedp.ByQuery),
		chromedp.Click(`#identifierNext`, chromedp.ByQuery),
		chromedp.Sleep(3*time.Second),
		chromedp.WaitVisible(`input[type="password"]`, chromedp.ByQuery),
		chromedp.SendKeys(`input[type="password"]`, password, chromedp.ByQuery),
		chromedp.Click(`#passwordNext`, chromedp.ByQuery),
		chromedp.Sleep(5*time.Second),
	)
	if err != nil {
		return fmt.Errorf("google login: %w", err)
	}

	log.Println("bot: logged in, navigating to meeting")
	return b.JoinMeeting(meetURL, "")
}

func (b *Bot) WaitUntilJoined(timeout time.Duration) error {
	ctx, cancel := context.WithTimeout(b.ctx, timeout)
	defer cancel()

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return fmt.Errorf("timeout waiting to join meeting")
		case <-ticker.C:
			var inMeeting bool
			err := chromedp.Run(b.ctx,
				chromedp.Evaluate(`
					!!document.querySelector('[aria-label="Leave call"]') ||
					!!document.querySelector('[data-tooltip="Leave call"]')
				`, &inMeeting),
			)
			if err != nil {
				continue
			}
			if inMeeting {
				log.Println("bot: successfully joined meeting")
				return nil
			}
		}
	}
}
