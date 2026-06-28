#!/usr/bin/env python3
"""
Range-request capable HTTP server for local MP3 player use.
Supports byte-range requests so audio seeking works in the browser.
Run from your musik folder: python serve.py
"""
import http.server
import os
import re

PORT = 8000

class RangeRequestHandler(http.server.SimpleHTTPRequestHandler):
    def send_head(self):
        path = self.translate_path(self.path)
        if os.path.isfile(path):
            size = os.path.getsize(path)
            range_header = self.headers.get('Range')

            if range_header:
                match = re.match(r'bytes=(\d+)-(\d*)', range_header)
                if match:
                    start = int(match.group(1))
                    end = int(match.group(2)) if match.group(2) else size - 1
                    end = min(end, size - 1)
                    length = end - start + 1

                    self.send_response(206)
                    self.send_header('Content-type', self.guess_type(path))
                    self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
                    self.send_header('Content-Length', str(length))
                    self.send_header('Accept-Ranges', 'bytes')
                    self.end_headers()

                    with open(path, 'rb') as f:
                        f.seek(start)
                        return_data = f.read(length)
                    import io
                    return io.BytesIO(return_data)

        # Fall back to normal handling for non-range requests
        f = super().send_head()
        return f

    def end_headers(self):
        self.send_header('Accept-Ranges', 'bytes')
        super().end_headers()

    def log_message(self, format, *args):
        # Suppress per-request logs for cleaner output
        pass

if __name__ == '__main__':
    handler = RangeRequestHandler
    with http.server.HTTPServer(('', PORT), handler) as httpd:
        print(f'Serving on http://localhost:{PORT}')
        print('Press Ctrl+C to stop.')
        httpd.serve_forever()
