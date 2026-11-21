import type { Metadata } from "next";
import { ChartLabPage } from "@/components/ChartLabPage";

export const metadata: Metadata = {
  title: "차트 · 전략 백테스트",
};

export default function ChartPage() {
  return (
    <main className="flex-1">
      <ChartLabPage />
    </main>
  );
}
