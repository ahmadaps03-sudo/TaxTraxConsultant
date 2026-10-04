"use client";

import { waLink } from "@/lib/contact";
const DEFAULT_MESSAGE = "Hi TaxTrax, I'd like to talk to a consultant about my taxes.";

export default function WhatsAppWidget() {
  const href = waLink(DEFAULT_MESSAGE);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with a TaxTrax consultant on WhatsApp"
      className="group fixed bottom-4 right-4 z-40 flex items-center gap-0 overflow-hidden rounded-full bg-[#25D366] text-white shadow-lg shadow-black/20 transition-all hover:gap-2 hover:pr-4 focus-ring"
    >
      <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-[#25D366]/50" style={{ animationDuration: "2.4s" }} aria-hidden />
      <span className="flex h-12 w-12 items-center justify-center">
        <WhatsAppIcon />
      </span>
      <span className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-medium transition-all duration-300 group-hover:max-w-[10rem]">
        Chat with us
      </span>
    </a>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.7.8-.8 1-.1.2-.3.2-.5.1-.2-.1-1-.4-1.9-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.4.1-.5.1-.1.2-.3.4-.4.1-.1.2-.2.2-.4.1-.1 0-.3 0-.4-.1-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 1.9s.8 2.2.9 2.3c.1.2 1.6 2.5 4 3.5.6.2 1 .4 1.3.5.6.2 1.1.2 1.5.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.1-.2-.1-.5-.3Z" />
    </svg>
  );
}
