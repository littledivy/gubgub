import { Handlers } from "$fresh/server.ts";
import { getContext } from "../../../../lib.ts";
import { join } from "$std/path/join.ts";
import { basename } from "$std/path/basename.ts";

export const handler: Handlers = {
  async GET(_req, ctx) {
    const { db, storage, config } = await getContext();
    const id = ctx.params.id;
    const meeting = await db.getMeeting(id);

    if (!meeting) {
      return Response.json({ error: "meeting not found" }, { status: 404 });
    }
    if (!meeting.recording_path) {
      return Response.json(
        { error: "no recording available" },
        { status: 404 },
      );
    }

    const key = meeting.recording_path;

    const presignedURL = await storage.getURL(key);
    if (presignedURL) {
      return Response.redirect(presignedURL, 302);
    }

    const localPath = join(config.recordingsDir, basename(key));
    let file: Deno.FsFile;
    let stat: Deno.FileInfo;
    try {
      file = await Deno.open(localPath, { read: true });
      stat = await file.stat();
    } catch {
      return Response.json(
        { error: "recording file not found" },
        { status: 404 },
      );
    }

    const size = stat.size;
    const range = _req.headers.get("range");

    if (range) {
      const match = range.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        const start = parseInt(match[1]);
        const end = match[2] ? parseInt(match[2]) : size - 1;
        const length = end - start + 1;

        await file.seek(start, Deno.SeekMode.Start);

        let remaining = length;
        const limited = new ReadableStream({
          async pull(controller) {
            const buf = new Uint8Array(Math.min(65536, remaining));
            const n = await file.read(buf);
            if (n === null || remaining <= 0) {
              controller.close();
              file.close();
              return;
            }
            remaining -= n;
            controller.enqueue(buf.subarray(0, n));
          },
          cancel() {
            file.close();
          },
        });

        return new Response(limited, {
          status: 206,
          headers: {
            "Content-Type": "video/webm",
            "Content-Range": `bytes ${start}-${end}/${size}`,
            "Content-Length": String(length),
            "Accept-Ranges": "bytes",
          },
        });
      }
    }

    return new Response(file.readable, {
      headers: {
        "Content-Type": "video/webm",
        "Content-Length": String(size),
        "Accept-Ranges": "bytes",
      },
    });
  },
};
