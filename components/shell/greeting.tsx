"use client";

import { useSyncExternalStore } from "react";

function partOfDay(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
const noop = () => () => {};

/** Greets by the device's local time (the server doesn't know the user's time zone). */
export function Greeting({ name }: { name: string | null }) {
  const part = useSyncExternalStore(noop, partOfDay, () => null);
  return (
    <h1 className="reading text-3xl font-semibold leading-tight">
      {part ?? "Welcome"}
      {name ? `, ${name}` : ""}
    </h1>
  );
}
