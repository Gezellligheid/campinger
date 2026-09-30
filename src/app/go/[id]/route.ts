import { NextResponse } from "next/server";
import { fetchCampsiteBySlug } from "@/lib/campsites";

export async function GET(
  request: Request,
  { params }: RouteContext<"/go/[id]">
) {
  const { id } = await params;

  let campsite;
  try {
    campsite = await fetchCampsiteBySlug(id);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load campsite" },
      { status: 502 }
    );
  }

  if (!campsite || !campsite.bookingUrl) {
    return NextResponse.json({ error: "Unknown campsite" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);

  // MVP click-tracking stand-in for the `redirect_clicks` Firestore write
  // described in infrastructure.md §8 — swap for an Admin SDK write once
  // the API layer has service-account credentials.
  console.log("[redirect_click]", {
    campsiteId: campsite.id,
    checkin: searchParams.get("checkin"),
    checkout: searchParams.get("checkout"),
    guests: searchParams.get("guests"),
    at: new Date().toISOString(),
  });

  const target = new URL(campsite.bookingUrl);
  searchParams.forEach((value, key) => target.searchParams.set(key, value));

  return NextResponse.redirect(target, { status: 302 });
}
