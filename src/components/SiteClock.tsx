"use client";

import { useEffect, useState } from "react";

export function SiteClock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const update = () =>
      setTime(
        new Intl.DateTimeFormat("zh-CN", {
          dateStyle: "medium",
          timeStyle: "medium",
          hour12: false,
        }).format(new Date()),
      );
    update();
    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, []);
  return <span suppressHydrationWarning>{time || "正在校准时间……"}</span>;
}
