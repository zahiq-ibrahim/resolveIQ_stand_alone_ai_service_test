
import { classifyTicket } from "./classify-ticket.js";

async function main(): Promise<void> {
  const ticket =
    "I was charged twice for my subscription and need a refund.";

  try {
    const result = await classifyTicket(ticket);

    console.log("\nTicket:");
    console.log(ticket);

    console.log("\nClassification:");
    console.log(JSON.stringify(result, null, 2));
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error("Classification failed:", error.message);
    } else {
      console.error("Classification failed:", error);
    }

    process.exitCode = 1;
  }
}

main();
