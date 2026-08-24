#!/bin/bash
cd "$(dirname "$0")"
echo "🦄 Starting OmniClaw Agent Unicorn on http://localhost:3002..."
bun server.ts
