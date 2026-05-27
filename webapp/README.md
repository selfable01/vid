# Video Combiner

A simple web app to stitch up to 4 MP4 video clips into one combined video using ffmpeg.

Live: **https://webapp-seven-silk.vercel.app**

## What it does

- Upload 2–4 MP4 clips in order
- Clips are stitched together server-side using ffmpeg (no re-encode, fast concat)
- Falls back to re-encode if clips have mismatched codecs
- Download the combined MP4 instantly

## Tech Stack

- **Next.js 16** (App Router)
- **ffmpeg-static** — bundled ffmpeg binary, no install needed
- **Vercel** — deployment

## Running locally

```bash
cd webapp
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Deploying

```bash
npx vercel deploy --prod
```

## Project structure

```
webapp/
├── app/
│   ├── page.tsx              # Video combiner UI
│   └── api/combine/route.ts  # ffmpeg concat API
```
