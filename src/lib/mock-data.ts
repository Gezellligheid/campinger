import type { Collection } from "./types";

function img(id: string, w = 900) {
  return `https://images.unsplash.com/${id}?q=80&w=${w}&auto=format&fit=crop`;
}

export const collections: Collection[] = [
  {
    slug: "best-for-families",
    title: "Best for families",
    description: "Pools, playgrounds, and mini-clubs to keep everyone busy.",
    image: img("photo-1510312305653-8ed496efae75"),
  },
  {
    slug: "near-the-coast",
    title: "Near the coast",
    description: "Wake up, walk to the water — no car required.",
    image: img("photo-1543968996-ee822b8176ba"),
  },
  {
    slug: "forest-hideaways",
    title: "Forest hideaways",
    description: "Shaded pitches and quiet, off-grid-feeling escapes.",
    image: img("photo-1487730116645-74489c95b41b"),
  },
];
