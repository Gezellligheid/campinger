"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { MapPin, Users, Search } from "lucide-react";
import DateRangePicker from "./DateRangePicker";

interface SearchBarProps {
  variant?: "hero" | "compact";
}

export default function SearchBar({ variant = "hero" }: SearchBarProps) {
  const router = useRouter();
  const params = useSearchParams();

  const [location, setLocation] = useState(params.get("location") ?? "");
  const [checkin, setCheckin] = useState(params.get("checkin") ?? "");
  const [checkout, setCheckout] = useState(params.get("checkout") ?? "");
  const [guests, setGuests] = useState(params.get("guests") ?? "2");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams();
    if (location) next.set("location", location);
    if (checkin) next.set("checkin", checkin);
    if (checkout) next.set("checkout", checkout);
    if (guests) next.set("guests", guests);
    router.push(`/search?${next.toString()}`);
  }

  const isCompact = variant === "compact";

  return (
    <form
      onSubmit={handleSubmit}
      className={`flex w-full flex-col gap-1.5 rounded-3xl bg-white/95 p-1.5 shadow-xl shadow-forest-900/10 ring-1 ring-forest-900/5 backdrop-blur sm:flex-row sm:items-center ${
        isCompact ? "sm:rounded-full" : "sm:rounded-full"
      }`}
    >
      <label className="flex min-w-0 flex-[1.6] items-center gap-3 rounded-full px-4 py-2.5 transition-colors hover:bg-sand-100/60">
        <MapPin className="h-5 w-5 shrink-0 text-terracotta-500" />
        <div className="flex min-w-0 flex-col">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
            Location
          </span>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Region, town, or camping name"
            className="w-full min-w-0 bg-transparent text-sm text-ink-900 placeholder:text-ink-300 focus:outline-none"
          />
        </div>
      </label>

      <div className="hidden h-8 w-px shrink-0 self-center bg-forest-900/10 sm:block" />

      <DateRangePicker
        checkin={checkin}
        checkout={checkout}
        onChange={(nextCheckin, nextCheckout) => {
          setCheckin(nextCheckin);
          setCheckout(nextCheckout);
        }}
        className="min-w-0 flex-1"
      />

      <div className="hidden h-8 w-px shrink-0 self-center bg-forest-900/10 sm:block" />

      <label className="flex shrink-0 items-center gap-3 rounded-full px-4 py-2.5 transition-colors hover:bg-sand-100/60 sm:w-32">
        <Users className="h-5 w-5 shrink-0 text-terracotta-500" />
        <div className="flex w-full flex-col">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
            Guests
          </span>
          <input
            type="number"
            min={1}
            max={12}
            value={guests}
            onChange={(e) => setGuests(e.target.value)}
            className="w-full bg-transparent text-sm text-ink-900 focus:outline-none"
          />
        </div>
      </label>

      <button
        type="submit"
        className="flex shrink-0 items-center justify-center gap-2 rounded-full bg-terracotta-500 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-terracotta-600"
      >
        <Search className="h-4 w-4" />
        <span>Search</span>
      </button>
    </form>
  );
}
