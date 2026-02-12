import { type PageProps } from "$fresh/server.ts";

export default function App({ Component }: PageProps) {
  return (
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>gubgub</title>
        <link rel="stylesheet" href="/styles.css" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
            (function() {
              var t = localStorage.getItem('theme');
              if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
            })();
          `,
          }}
        />
      </head>
      <body>
        <Component />
      </body>
    </html>
  );
}
