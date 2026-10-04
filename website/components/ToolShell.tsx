"use client";

import { ReactNode, useState } from "react";
import LeadCaptureModal from "./LeadCaptureModal";

export default function ToolShell({
  icon, title, description, conversionTrigger, children, resultLines, reportTitle,
}: {
  icon: string;
  title: string;
  description: string;
  conversionTrigger: string;
  children: ReactNode; // the form + result markup
  resultLines: string[] | null; // pass null until a calculation has been run
  reportTitle: string;
}) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="mx-auto max-w-4xl px-5 py-16">
      <div className="flex items-start gap-4">
        <span className="text-3xl" aria-hidden>{icon}</span>
        <div>
          <h1 className="font-serif text-3xl text-paper">{title}</h1>
          <p className="mt-2 max-w-xl text-sm text-smoke">{description}</p>
        </div>
      </div>

      <div className="card-flat mt-8 p-6 sm:p-6">{children}</div>

      {resultLines && (
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            onClick={() => setModalOpen(true)}
            className="bg-signal px-5 py-2.5 text-sm font-medium text-ink hover:bg-ember transition-colors focus-ring"
          >
            Unlock PDF report & WhatsApp copy
          </button>
        </div>
      )}

      <p className="mt-8 border-t border-line pt-6 text-sm text-paper/80">
        <span className="text-signal">Next step — </span>{conversionTrigger}
      </p>

      <p className="mt-4 text-xs text-smoke">
        Rates shown are indicative and based on the latest publicly available Finance Act / FBR schedules at the time of
        writing. Confirm current-year rates with a TaxTrax advisor before filing.
      </p>

      <LeadCaptureModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        reportTitle={reportTitle}
        summaryLines={resultLines ?? []}
      />
    </div>
  );
}
