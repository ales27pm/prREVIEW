# Implementation Roadmap

This roadmap outlines the recommended steps to evolve the PR Review Assistant into a fully adaptive, context‑aware developer tool. It distills the key actions from the "Architectural and Strategic Analysis" report.

## Phase 1: Foundational Improvements (0‑3 Months)

1. **Harden API Key Storage**
   - Store API keys using `chrome.storage.local` instead of `chrome.storage.sync`.
   - Provide a migration step for existing users.

2. **Refactor `content.js`**
   - Break the `runReviewFlow` logic into smaller modules for UI updates, GitHub API calls, and OpenAI API calls.
   - Move orchestration logic that does not require DOM access to the service worker for better scalability.

3. **Model‑Specific Prompt Handling**
   - Detect the configured language model.
   - Apply model‑optimized prompt formatting (e.g., wrap prompts in XML for Claude models).

## Phase 2: Architectural Evolution (3‑9 Months)

1. **Knowledge Graph–Enhanced RAG**
   - Extend the repository indexer (`indexRepo.js`) to extract entities (functions, classes, modules) and their relationships.
   - Store this structured data alongside vector embeddings.
   - Update `rag.js` to traverse the knowledge graph when retrieving context.

2. **Feedback Backend & Analytics**
   - Build a backend service to collect explicit ratings and adoption data from `feedback.js`.
   - Provide dashboards or exports for analyzing the feedback.
   - Prepare curated datasets for model fine‑tuning.

3. **Advanced Multi‑Agent Reflection**
   - Enhance the synthesizer agent in `openaiApi.js` to act as a reflector that filters, deduplicates and prioritizes comments from initial agents.
   - Tune prompts to emphasize contradiction detection and noise reduction.

## Phase 3: Advanced Intelligence (9‑18+ Months)

1. **Parameter‑Efficient Fine‑Tuning (PEFT)**
   - Use the curated feedback dataset to fine‑tune open‑source code models with LoRA or similar techniques.
   - Evaluate fine‑tuned models using the adoption rate metric.

2. **Specialized Review Modules**
   - Add review modes focusing on Security, Performance and Test Generation.
   - Provide UI controls to select these modes and tailor prompts accordingly.

3. **One‑Click Code Suggestions**
   - Enable the assistant to propose code diffs in a structured format.
   - Render proposed diffs in the GitHub UI for easy application by developers.

---

This phased approach builds on the current codebase and data collection framework to deliver a sophisticated, continuously improving reviewer that goes beyond general code quality checks.
