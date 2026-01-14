"use client";

import * as React from "react";
import { Volume2, Square } from "lucide-react";
import { Button } from "@/components/ui";

export function SpeakButton({
  text,
  lang,
  labelSpeak = "Listen",
  labelStop = "Stop audio",
}: {
  text: string;
  lang: string;
  labelSpeak?: string;
  labelStop?: string;
}) {
  const [speaking, setSpeaking] = React.useState(false);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

  React.useEffect(() => {
    return () => {
      try {
        window.speechSynthesis?.cancel();
      } catch {
        // ignore
      }
    };
  }, []);

  function stop() {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
    setSpeaking(false);
  }

  function speak() {
    if (!supported) return;
    if (!text.trim()) return;

    stop();

    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang || "en-US";

    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);

    setSpeaking(true);
    window.speechSynthesis.speak(u);
  }

  if (!supported) return null;

  return (
    <Button
      variant="ghost"
      className="gap-2"
      onClick={speaking ? stop : speak}
      aria-label={speaking ? labelStop : labelSpeak}
    >
      {speaking ? <Square size={16} /> : <Volume2 size={16} />}
    </Button>
  );
}
