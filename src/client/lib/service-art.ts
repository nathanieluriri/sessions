/** Illustrated icons for the service cards. Line icons remain the fallback. */
export const SERVICE_ILLUSTRATIONS: Record<string, string> = {
  recording: "/icons/recording.png",
  "beat-production": "/icons/beat-production.png",
  "mixing-mastering": "/icons/mixing-mastering.png",
  "full-production": "/icons/full-production.png",
  "song-covers": "/icons/song-covers.png",
  "music-videos": "/icons/music-videos.png",
  "commercial-video": "/icons/commercial-video.png",
  interviews: "/icons/interviews.png",
  "video-post": "/icons/video-post.png",
  "bts-content": "/icons/bts-content.png",
  "podcast-recording": "/icons/podcast-recording.png",
  "video-podcast": "/icons/video-podcast.png",
  "podcast-editing": "/icons/podcast-editing.png",
  "podcast-intros": "/icons/podcast-intros.png",
  "artist-portraits": "/icons/artist-portraits.png",
  "product-photography": "/icons/product-photography.png",
  "social-content": "/icons/social-content.png",
  reels: "/icons/reels.png",
};

export const illustrationFor = (slug: string) => SERVICE_ILLUSTRATIONS[slug] ?? "";
