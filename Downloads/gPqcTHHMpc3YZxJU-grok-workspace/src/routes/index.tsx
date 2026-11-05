import { createFileRoute } from "@tanstack/react-router";
import { ChessApp } from "@/chess/ChessApp";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return <ChessApp />;
}
