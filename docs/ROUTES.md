# ROUTES

## Health

`GET /message`

Returns a simple message.

## Docs

`GET /api/docx`

Returns the docs page.

## Providers (id-based)

`GET /sources?id={id}&host={host}`

### Parameters

- `id`: The ID of the movie or TV show.
- `host`: The host to use for the request.

### Returns

```json
{
  "success": true,
  "host": "daily",
  "id": "2698510",
  "data": {
    "sources": [
      {
        "src": "https://example.com/video.mp4",
        "type": "video/mp4"
      }
    ]
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": "Invalid ID"
}
```

## Providers (url-based)

`GET /sources?url={url}`

### Parameters

- `url`: The URL of the movie or TV show.

### Returns

```json
{
  "success": true,
  "url": "https://example.com/video.mp4",
  "data": {
    "sources": [
      {
        "src": "https://example.com/video.mp4",
        "type": "video/mp4"
      }
    ]
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": "Invalid URL"
}
```
