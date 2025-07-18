# Implementation Roadmap

This roadmap outlines the recommended steps to evolve the PR Review Assistant into a fully adaptive, context-aware developer tool. It distills the key actions from the "Architectural and Strategic Analysis" report.

## Phase 0: Project Setup & Testing

1. **Automated Test Pipeline** — _implemented_
   - Configure a CI workflow that runs `npm test` on every pull request.
2. **Contributor Onboarding** — _implemented_
   - Expand the README with setup instructions and troubleshooting tips.
3. **Sample Configuration** — _implemented_
   - Provide example files showing how to store API keys locally during development.

**Success metrics**

- CI pipeline passes for all opened pull requests.
- New contributors report a smooth setup experience.

## Phase 1: Foundational Improvements

1. **Harden API Key Storage** — _implemented_
   - Store API keys using `chrome.storage.local` instead of `chrome.storage.sync`.
   - Provide a migration step for existing users.

2. **Refactor `content.js`** - _not implemented_
   - Break the `runReviewFlow` logic into smaller modules for UI updates, GitHub API calls, and OpenAI API calls.
   - Move orchestration logic that does not require DOM access to the service worker for better scalability.
3. **Enhanced Prompting** — _implemented_
   - Refine default prompts to encourage concise reasoning and actionable comments.
   - Experiment with system-level instructions to improve comment relevance.

4. **Model-Specific Prompt Handling** — _implemented_
   - Detect the configured language model.
   - Apply model-optimized prompt formatting (e.g., wrap prompts in XML for Claude models).

5. **Human Feedback Loop** — _implemented_
   - Attach thumbs-up/down buttons to AI comments via `feedback.js`.
   - Track comment adoption after merge to measure usefulness.

**Success metrics**

- API credentials stored locally for all new installations.
- Benchmark prompt response quality before and after model-specific formatting.
- User feedback collected for at least 20 AI comments with adoption tracking enabled.

**Future metrics**

- Lint and tests pass once the `content.js` refactor is completed.

## Phase 2: Architectural Evolution

1. **Knowledge Graph-Enhanced RAG** — _implemented_
   - **Step 1:** extend the repository indexer (`indexRepo.js`) to capture a simple call graph.
   - **Step 2:** incorporate class and module relationships into the graph.
   - **Step 3:** store the graph alongside vector embeddings and expose a query API.
   - **Step 4:** update `rag.js` to retrieve context via graph traversal.

2. **Feedback Backend & Analytics** — _partially implemented_
   - Build a backend service to collect explicit ratings and adoption data from `feedback.js`.
   - Provide dashboards or exports for analyzing the feedback.
   - Prepare curated datasets for model fine-tuning.

3. **Advanced Multi-Agent Reflection** — _implemented_
   - Enhance the synthesizer agent in `openaiApi.js` to act as a reflector that filters, deduplicates and prioritizes comments from initial agents.
   - Tune prompts to emphasize contradiction detection and noise reduction.

**Success metrics**

- Knowledge graph retrieval demonstrates higher context relevance in unit tests.
- Feedback backend collects at least 100 ratings with analytics dashboards available.
- Multi-agent reflection reduces duplicate comments in synthetic benchmarks.

## Phase 3: Advanced Intelligence

1. **Parameter-Efficient Fine-Tuning (PEFT)** — _implemented_
   - Use the curated feedback dataset to fine-tune open-source code models with LoRA or similar techniques.
   - Evaluate fine-tuned models using the adoption rate metric.

2. **Specialized Review Modules** — _implemented_
   - Add review modes focusing on Security, Performance and Test Generation.
   - Provide UI controls to select these modes and tailor prompts accordingly.

3. **One-Click Code Suggestions** — _in progress_
   - Enable the assistant to propose code diffs in a structured format.
   - Render proposed diffs in the GitHub UI for easy application by developers.

**Success metrics**

- Fine-tuned models outperform base models on adoption rate by at least 10%.
- Security/performance/test modules usable by beta users with positive feedback.
- End-to-end flow for applying code suggestions validated in user testing.

---

This phased approach builds on the current codebase and data collection framework to deliver a sophisticated, continuously improving reviewer that goes beyond general code quality checks.
