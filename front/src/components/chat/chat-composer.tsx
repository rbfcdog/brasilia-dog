"use client";

import { ArrowUp, LockKeyhole } from "lucide-react";
import { FormEvent, KeyboardEvent, useState } from "react";

export function ChatComposer({
  onSend,
  disabled,
  placeholder,
}: {
  onSend: (message: string) => Promise<void>;
  disabled: boolean;
  placeholder: string;
}) {
  const [value, setValue] = useState("");

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!value.trim() || disabled) return;
    const message = value;
    setValue("");
    await onSend(message);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <div className="border-t border-line bg-white/95 px-4 py-3 backdrop-blur-md md:px-7 md:py-4">
      <form onSubmit={submit} className="mx-auto max-w-3xl">
        <div className="flex items-end gap-2 rounded-2xl border border-line bg-white p-2.5 pl-4 shadow-input transition focus-within:border-primary/35 focus-within:ring-4 focus-within:ring-primary/[0.06]">
          <label htmlFor="shopping-request" className="sr-only">Describe what you want to buy</label>
          <textarea
            id="shopping-request"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            rows={1}
            placeholder={placeholder}
            className="max-h-32 min-h-10 flex-1 resize-none bg-transparent py-2 text-[15px] leading-6 text-ink outline-none placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-65"
          />
          <button
            type="submit"
            disabled={disabled || !value.trim()}
            aria-label="Send request"
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-white shadow-sm transition hover:bg-primary-hover hover:shadow-md active:translate-y-px disabled:bg-line disabled:text-muted disabled:shadow-none motion-reduce:transform-none"
          >
            <ArrowUp className="size-4" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-2 flex items-center justify-center gap-1.5 text-[10px] text-muted">
          <LockKeyhole className="size-3" aria-hidden="true" /> Your agent cannot spend outside an approved mandate.
        </p>
      </form>
    </div>
  );
}
