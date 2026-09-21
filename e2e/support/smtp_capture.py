"""Минимальный SMTP-приёмник для локальных E2E.

Каждое письмо сохраняется как .eml. Никакой пересылки наружу нет.
"""
from __future__ import annotations

import argparse
import asyncio
import time
import uuid
from email import policy
from email.parser import BytesParser
from pathlib import Path


async def handle_client(
    reader: asyncio.StreamReader,
    writer: asyncio.StreamWriter,
    output_dir: Path,
) -> None:
    writer.write(b"220 aegis-e2e SMTP ready\r\n")
    await writer.drain()
    try:
        while line := await reader.readline():
            command = line.decode("utf-8", errors="replace").strip()
            verb = command.split(" ", 1)[0].upper()
            if verb in {"EHLO", "HELO"}:
                writer.write(b"250-aegis-e2e\r\n250 SIZE 1048576\r\n")
            elif verb in {"MAIL", "RCPT", "RSET", "NOOP"}:
                writer.write(b"250 OK\r\n")
            elif verb == "DATA":
                writer.write(b"354 End data with <CR><LF>.<CR><LF>\r\n")
                await writer.drain()
                message = bytearray()
                while data_line := await reader.readline():
                    if data_line == b".\r\n":
                        break
                    if data_line.startswith(b".."):
                        data_line = data_line[1:]
                    message.extend(data_line)
                name = f"{time.time_ns()}-{uuid.uuid4().hex}.eml"
                payload = bytes(message)
                (output_dir / name).write_bytes(payload)
                parsed = BytesParser(policy=policy.default).parsebytes(payload)
                body_part = parsed.get_body(preferencelist=("plain",))
                body = body_part.get_content() if body_part else ""
                (output_dir / name.replace(".eml", ".txt")).write_text(
                    f"To: {parsed.get('To', '')}\nSubject: {parsed.get('Subject', '')}\n\n{body}",
                    encoding="utf-8",
                )
                writer.write(b"250 Stored\r\n")
            elif verb == "QUIT":
                writer.write(b"221 Bye\r\n")
                await writer.drain()
                break
            else:
                writer.write(b"250 OK\r\n")
            await writer.drain()
    finally:
        writer.close()
        await writer.wait_closed()


async def main(host: str, port: int, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    server = await asyncio.start_server(
        lambda reader, writer: handle_client(reader, writer, output_dir),
        host,
        port,
    )
    print(f"SMTP capture listening on {host}:{port}; dir={output_dir}", flush=True)
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=1025)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    asyncio.run(main(args.host, args.port, args.output_dir))
