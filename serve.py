#!/usr/bin/env python3
"""Static server สำหรับสไลด์ — ปิด cache ทุกไฟล์
เพื่อให้แก้โค้ดแล้วรีเฟรชเห็นทันที (ไม่งั้นเบราว์เซอร์อาจใช้ JS/CSS ตัวเก่า)
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write('%s - %s\n' % (self.address_string(), fmt % args))


if __name__ == '__main__':
    handler = partial(NoCacheHandler, directory='.')
    with ThreadingHTTPServer(('0.0.0.0', PORT), handler) as httpd:
        print(f'serving on 0.0.0.0:{PORT} (no-store)', flush=True)
        httpd.serve_forever()
