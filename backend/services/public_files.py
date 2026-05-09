from bson import ObjectId
from fastapi import HTTPException
from fastapi.responses import StreamingResponse


PUBLIC_IMAGE_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
}

PUBLIC_FILE_HEADERS = {
    "Cache-Control": "public, max-age=86400, immutable",
    "X-Content-Type-Options": "nosniff",
}


def parse_grid_id(grid_id: str, label: str = "Arquivo") -> ObjectId:
    if not ObjectId.is_valid(grid_id):
        raise HTTPException(404, f"{label} não encontrado")
    return ObjectId(grid_id)


async def stream_public_gridfs_file(bucket, grid_id: str, *, label: str = "Arquivo") -> StreamingResponse:
    oid = parse_grid_id(grid_id, label)

    try:
        grid_out = await bucket.open_download_stream(oid)
    except Exception:
        raise HTTPException(404, f"{label} não encontrado")

    content_type = (grid_out.metadata or {}).get("content_type") or "application/octet-stream"
    if content_type not in PUBLIC_IMAGE_TYPES:
        raise HTTPException(404, f"{label} não encontrado")

    return StreamingResponse(
        grid_out,
        media_type=content_type,
        headers=PUBLIC_FILE_HEADERS,
    )
