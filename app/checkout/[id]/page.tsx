import type { Metadata } from "next";
import CheckoutClient from "./CheckoutClient";

export const metadata: Metadata = {
  title: "Checkout — StockHold",
  description: "Complete your purchase before the reservation expires.",
};

interface CheckoutPageProps {
  params: Promise<{ id: string }>;
}

export default async function CheckoutPage({ params }: CheckoutPageProps) {
  const { id } = await params;
  return <CheckoutClient id={id} />;
}
