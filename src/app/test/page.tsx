"use client";

import { useState } from "react";

// Simple test page without any external dependencies
export default function TestPage() {
  const [count, setCount] = useState(0);

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-foreground mb-4">Test Page</h1>
        <p className="text-muted-foreground mb-4">Count: {count}</p>
        <button
          onClick={() => setCount(c => c + 1)}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md"
        >
          Increment
        </button>
      </div>
    </div>
  );
}
