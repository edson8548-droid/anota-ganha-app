import subprocess
import wave
from pathlib import Path

import imageio_ffmpeg


ROOT = Path(__file__).resolve().parent
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
SLIDES = [
    {
        "image": ROOT / "venpro-rca-slide-1.png",
        "audio": ROOT / "audio-slide-1.wav",
        "segment": ROOT / "segment-1.mp4",
    },
    {
        "image": ROOT / "venpro-rca-slide-2.png",
        "audio": ROOT / "audio-slide-2.wav",
        "segment": ROOT / "segment-2.mp4",
    },
    {
        "image": ROOT / "venpro-rca-slide-3.png",
        "audio": ROOT / "audio-slide-3.wav",
        "segment": ROOT / "segment-3.mp4",
    },
    {
        "image": ROOT / "venpro-rca-slide-4.png",
        "audio": ROOT / "audio-slide-4.wav",
        "segment": ROOT / "segment-4.mp4",
    },
    {
        "image": ROOT / "venpro-rca-slide-5.png",
        "audio": ROOT / "audio-slide-5.wav",
        "segment": ROOT / "segment-5.mp4",
    },
]


def wav_duration(path):
    with wave.open(str(path), "rb") as wav:
        return wav.getnframes() / float(wav.getframerate())


def run(command):
    subprocess.run(command, check=True)


def make_segment(slide):
    duration = max(wav_duration(slide["audio"]) + 0.65, 4.5)
    run([
        FFMPEG,
        "-y",
        "-loop", "1",
        "-framerate", "30",
        "-i", str(slide["image"]),
        "-i", str(slide["audio"]),
        "-t", f"{duration:.2f}",
        "-vf", "scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "20",
        "-c:a", "aac",
        "-b:a", "160k",
        "-shortest",
        str(slide["segment"]),
    ])


def concat_segments(output):
    list_file = ROOT / "segments.txt"
    list_file.write_text(
        "".join(f"file '{slide['segment'].as_posix()}'\n" for slide in SLIDES),
        encoding="utf-8",
    )
    run([
        FFMPEG,
        "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", str(list_file),
        "-c", "copy",
        str(output),
    ])


def main():
    for slide in SLIDES:
        make_segment(slide)
    concat_segments(ROOT.parent / "venpro-video-rca-whatsapp-instagram.mp4")


if __name__ == "__main__":
    main()
