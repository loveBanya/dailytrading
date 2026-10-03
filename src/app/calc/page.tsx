import type { Metadata } from "next";
import { CalcWindow } from "@/components/CalcWindow";

export const metadata: Metadata = {
  title: "계산",
};

export default function CalcPage() {
  return <CalcWindow />;
}
