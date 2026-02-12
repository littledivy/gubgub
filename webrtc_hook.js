(function () {
  window._gubgubTracks = [];
  window._gubgubChunks = [];
  window._gubgubRecorder = null;
  window._gubgubRecording = false;
  window._gubgubStartPending = false;
  window._gubgubHasVideo = false;
  window._gubgubLocalStreamIds = new Set();
  window._gubgubRemoteVideoTrackIds = new Set();

  var origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(
    navigator.mediaDevices,
  );
  navigator.mediaDevices.getUserMedia = function () {
    return origGetUserMedia.apply(navigator.mediaDevices, arguments).then(
      function (stream) {
        window._gubgubLocalStreamIds.add(stream.id);
        stream.getTracks().forEach(function (t) {
          console.log("[gubgub] Local track (getUserMedia):", t.kind, t.id);
        });
        return stream;
      },
    );
  };

  if (navigator.mediaDevices.getDisplayMedia) {
    var origGetDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getDisplayMedia = function () {
      return origGetDisplayMedia.apply(navigator.mediaDevices, arguments).then(
        function (stream) {
          window._gubgubLocalStreamIds.add(stream.id);
          stream.getTracks().forEach(function (t) {
            console.log(
              "[gubgub] Local track (getDisplayMedia):",
              t.kind,
              t.id,
            );
          });
          return stream;
        },
      );
    };
  }

  var OrigRTC = window.RTCPeerConnection;
  window.RTCPeerConnection = new Proxy(OrigRTC, {
    construct: function (target, args, newTarget) {
      var pc = Reflect.construct(target, args, newTarget);

      pc.addEventListener("track", function (event) {
        var t = event.track;
        console.log(
          "[gubgub] Remote track:",
          t.kind,
          t.id,
          "readyState:",
          t.readyState,
        );
        window._gubgubTracks.push(t);
        if (t.kind === "video") {
          window._gubgubRemoteVideoTrackIds.add(t.id);
        }
      });

      return pc;
    },
  });

  window._gubgubIsRemoteVideo = function (videoEl) {
    if (!videoEl.srcObject) return false;
    var streamId = videoEl.srcObject.id;
    if (window._gubgubLocalStreamIds.has(streamId)) return false;
    var tracks = videoEl.srcObject.getVideoTracks();
    for (var i = 0; i < tracks.length; i++) {
      if (window._gubgubRemoteVideoTrackIds.has(tracks[i].id)) return true;
    }
    if (!window._gubgubLocalStreamIds.has(streamId)) return true;
    return false;
  };

  window._gubgubStartRecording = function () {
    if (
      window._gubgubRecorder && window._gubgubRecorder.state === "recording"
    ) return;

    var canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    var ctx2d = canvas.getContext("2d");

    window._gubgubCanvasInterval = setInterval(function () {
      var videos = Array.from(document.querySelectorAll("video")).filter(
        function (v) {
          return v.videoWidth > 0 && v.videoHeight > 0 && !v.paused &&
            window._gubgubIsRemoteVideo(v);
        },
      );

      if (videos.length === 0) {
        videos = Array.from(document.querySelectorAll("video")).filter(
          function (v) {
            if (v.videoWidth <= 0 || v.videoHeight <= 0 || v.paused) {
              return false;
            }
            if (
              v.srcObject && window._gubgubLocalStreamIds.has(v.srcObject.id)
            ) return false;
            return true;
          },
        );
      }

      if (videos.length > 0) {
        videos.sort(function (a, b) {
          return (b.videoWidth * b.videoHeight) -
            (a.videoWidth * a.videoHeight);
        });
        try {
          ctx2d.drawImage(videos[0], 0, 0, canvas.width, canvas.height);
          window._gubgubHasVideo = true;
        } catch (e) {}
      }
    }, 100);

    var canvasStream = canvas.captureStream(10);
    var stream = new MediaStream();
    canvasStream.getVideoTracks().forEach(function (t) {
      stream.addTrack(t);
    });

    window._gubgubTracks.forEach(function (t) {
      if (t.readyState === "live" && t.kind === "audio") {
        stream.addTrack(t);
      }
    });

    var audioTracks = stream.getAudioTracks();
    var videoTracks = stream.getVideoTracks();
    console.log(
      "[gubgub] Building stream:",
      audioTracks.length,
      "audio,",
      videoTracks.length,
      "video",
    );

    if (audioTracks.length === 0) {
      console.log("[gubgub] No live audio tracks yet, retrying in 3s");
      clearInterval(window._gubgubCanvasInterval);
      setTimeout(function () {
        window._gubgubStartRecording();
      }, 3000);
      return;
    }

    var mimeType = "video/webm;codecs=vp8,opus";
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = "video/webm";
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = "audio/webm;codecs=opus";
      }
    }
    console.log("[gubgub] Using MIME type:", mimeType);

    try {
      var recorder = new MediaRecorder(stream, { mimeType: mimeType });
      recorder.ondataavailable = function (e) {
        if (e.data && e.data.size > 0) {
          var reader = new FileReader();
          reader.onloadend = function () {
            var idx = reader.result.indexOf(";base64,");
            var b64 = idx !== -1 ? reader.result.substring(idx + 8) : null;
            if (b64) {
              window._gubgubChunks.push(b64);
            }
          };
          reader.readAsDataURL(e.data);
        }
      };
      recorder.onerror = function (e) {
        console.error("[gubgub] MediaRecorder error:", e.error);
        window._gubgubRecording = false;
        setTimeout(function () {
          window._gubgubStartRecording();
        }, 3000);
      };
      recorder.start(1000);
      window._gubgubRecorder = recorder;
      window._gubgubRecording = true;
      console.log("[gubgub] Recording started");
    } catch (e) {
      console.error("[gubgub] Failed to start MediaRecorder:", e);
      window._gubgubRecording = false;
      setTimeout(function () {
        window._gubgubStartRecording();
      }, 3000);
    }
  };

  window._gubgubStopRecording = function () {
    window._gubgubRecording = false;
    if (window._gubgubCanvasInterval) {
      clearInterval(window._gubgubCanvasInterval);
    }
    if (window._gubgubRecorder && window._gubgubRecorder.state !== "inactive") {
      window._gubgubRecorder.stop();
    }
  };

  console.log("[gubgub] WebRTC hook installed");
})();
