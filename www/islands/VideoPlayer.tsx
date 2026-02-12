export default function VideoPlayer({ src }: { src: string }) {
  return (
    <div class="video-container">
      <video controls preload="auto" src={src}>
        Your browser does not support the video element.
      </video>
    </div>
  );
}
