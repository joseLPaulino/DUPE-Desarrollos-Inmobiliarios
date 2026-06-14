# L1 Architecture Document
# AI-Powered Claims Assistant for Insurance Customer Service

**Client:** Large Insurance Company (500+ Customer Service Agents)
**Use Case:** AI-Assisted Policy and Claims Knowledge Retrieval
**Document Version:** 1.0
**Date:** 2026-06-14
**Classification:** Confidential

---

## 1. Executive Summary

A major insurance company with over 500 customer service agents faces a significant productivity bottleneck: agents spend approximately 40% of their working time manually searching through SharePoint-hosted policy documents and Salesforce-stored claim notes to answer customer questions. At scale, this translates to thousands of agent-hours lost daily — hours that should be spent on high-value customer interaction, not document retrieval.

The proposed solution is an AI-powered Claims Assistant — a retrieval-augmented generation (RAG) system integrated directly into the agent desktop. Agents ask questions in plain language; the system retrieves relevant excerpts from both SharePoint policy documents and Salesforce claim records, synthesizes a grounded, cited response, and surfaces it within seconds. The agent gets the answer, validates it, and responds to the customer — no tab-switching, no manual searching.

This architecture is the right fit because the problem is fundamentally an information retrieval and synthesis challenge over a known, bounded corpus. RAG is well-proven for this pattern: it grounds LLM outputs in authoritative source documents, dramatically reducing hallucination risk, and it integrates cleanly with existing enterprise document systems. The POC can be delivered in 6 weeks with real data, demonstrating measurable time savings before any significant infrastructure investment.

---

## 2. Problem Understanding

**Current State and Pain Points**

Customer service agents at this insurer operate under dual pressure: customers expect fast, accurate answers while agents must cross-reference complex, frequently updated policy language with the specific claim history for each customer. Policy documents live in SharePoint — structured but voluminous, with hundreds of policy types, endorsements, and FAQs. Claim notes live in Salesforce — semi-structured, written by various agents over time in inconsistent formats.

Today, an agent receiving a question like "Is my client's roof leak covered under their homeowners policy, and was a similar claim denied before?" must: open SharePoint, navigate to the relevant policy category, manually search for the applicable clause, then switch to Salesforce, query the account, read through historical claim notes, and synthesize an answer — all while the customer is waiting on the line or live chat.

**Impact of the Problem**

- **Productivity:** 40% of agent time lost to search equates to roughly 200 FTE-equivalents of wasted capacity across 500 agents
- **Quality risk:** Agents may miss relevant policy nuance or prior claim context under time pressure, leading to incorrect guidance or inconsistent customer experiences
- **Customer satisfaction:** Search latency directly translates to longer handle times and lower CSAT scores
- **Compliance risk:** Agents who cannot quickly locate accurate policy language may give informal or incorrect coverage interpretations

**Why AI Is Appropriate Here**

The corpus is defined (SharePoint + Salesforce), the query pattern is consistent (natural language questions about policies and claims), and the expected output is synthesized prose with citations — exactly the strength profile of RAG with a capable LLM. The system does not need to make decisions or take actions autonomously; it surfaces information for a human agent to validate and use. This human-in-the-loop design keeps risk low and fits well within insurance compliance requirements.

---

## 3. User Goals and Requirements

**Functional Requirements**

1. Accept natural language questions from agents via a chat interface embedded in the agent desktop
2. Retrieve relevant policy document excerpts from the SharePoint knowledge base in real time
3. Retrieve relevant historical claim notes from Salesforce for the specified customer or claim ID
4. Synthesize a coherent, cited response combining both sources, clearly distinguishing policy language from claim history
5. Display source citations with links back to the original SharePoint document or Salesforce record
6. Support follow-up questions within a session, maintaining context of the current customer interaction
7. Allow agents to provide thumbs-up/thumbs-down feedback on each response for continuous improvement
8. Support optional query filters (policy type, date range, claim status) to narrow retrieval scope
9. Log all queries and responses for compliance audit trail
10. Surface a confidence indicator when retrieved content has low relevance to the query

**Non-Functional Requirements**

- **Latency:** End-to-end response time under 5 seconds for 95th percentile queries
- **Availability:** 99.5% uptime during business hours (agent shift coverage, typically 7am–10pm local)
- **Scalability:** Support 500 concurrent users; scale to 1,000 without re-architecture
- **Data freshness:** SharePoint index refreshed within 4 hours of document updates; Salesforce data retrieved live via API (no stale cache)
- **Security:** No customer PII transmitted to third-party LLM APIs without masking or tokenization; all data stays within enterprise network perimeter or approved cloud tenant
- **Auditability:** Full query-response-source traceability stored for minimum 7 years per insurance regulatory requirements
- **Accessibility:** WCAG 2.1 AA compliance for the agent-facing UI

**User Personas**

- **Customer Service Agent (Primary):** Uses the chat interface during live customer calls or chats. Needs fast, accurate answers with clear sourcing. Not technical — must be zero-training-friction to adopt.
- **Team Lead / Supervisor:** Reviews flagged responses, monitors agent usage dashboards, and can annotate incorrect AI responses to feed back into fine-tuning or prompt refinement.
- **Compliance Officer:** Audits query logs and response records. Needs export capability and full traceability to source documents.
- **Knowledge Manager:** Manages the SharePoint document corpus. Needs to know which documents are most queried and which produce low-confidence retrievals, to prioritize content updates.
- **IT / Platform Administrator:** Manages integrations, monitors system health, and handles SharePoint/Salesforce connector credentials.

---

## 4. Assumptions and Open Questions

**Assumptions**

- SharePoint is SharePoint Online (Microsoft 365 tenant), not on-premises SharePoint Server
- Salesforce is an enterprise Salesforce org with API access enabled; claim notes are stored as free-text fields or activities/attachments on Case objects
- The existing agent desktop is a web application (browser-based), allowing a sidebar widget or embedded iframe integration without requiring a full desktop app deployment
- Policy documents are predominantly PDF and Word (.docx) format with some HTML pages; total corpus is estimated at 50,000–200,000 pages
- The company has an existing Microsoft 365 / Azure AD tenant that can be used for SSO
- English is the primary language for documents and queries; multilingual support is treated as a future enhancement
- The company has or can obtain an Azure OpenAI Service agreement or equivalent enterprise LLM contract that meets data residency and PII requirements
- A dedicated IT contact can provide SharePoint and Salesforce read-only service account credentials for the POC
- Agents currently use a CRM or agent desktop tool (e.g., Salesforce Service Cloud, Genesys, or similar) that can surface an embedded web widget

**Open Questions**

1. What is the exact size of the SharePoint document corpus (document count, total pages, update frequency)?
2. Are claim notes stored as Salesforce Case comments, feed items, custom fields, or file attachments — or a mix?
3. Is there an existing Microsoft Azure subscription we can use, or is cloud provisioning net-new?
4. What is the agent desktop platform (Salesforce Service Cloud Lightning, custom web app, Genesys, Five9, etc.)?
5. Are there any existing SharePoint search configurations or content classifications we should leverage or avoid overriding?
6. What PII masking or anonymization requirements apply specifically to LLM API calls (some insurers prohibit sending any claim-level data offsite)?
7. Is there a model preference or restriction (e.g., must use Azure OpenAI specifically, or must avoid GPT-4 for cost reasons)?
8. Does the compliance team require human review of all AI-generated responses, or is post-hoc audit logging sufficient?
9. What languages do documents and queries appear in (English only, or multilingual)?
10. Is there an existing data classification scheme for SharePoint documents (e.g., Public, Internal, Confidential) that should gate retrieval by agent role?

---

## 5. Recommended Agentic AI Pattern

**Primary Pattern: RAG (Retrieval-Augmented Generation)**

RAG is the central pattern for this solution. When an agent submits a question, the system encodes the query into a vector embedding, performs a semantic similarity search against pre-indexed vectors of the SharePoint corpus, and simultaneously queries Salesforce via API for live claim records. Retrieved chunks are assembled into a context window and passed to an LLM, which synthesizes a grounded, cited response. This pattern is ideal here because:

- The answer always comes from authoritative source documents — hallucination is constrained to paraphrasing, not fact invention
- The SharePoint corpus is bounded and indexable; update latency (4-hour refresh) is acceptable
- Salesforce claim data must be live (not stale), so it is retrieved at query time via API rather than pre-indexed

**Secondary Pattern: Router Agent**

Because queries can require different retrieval strategies — policy-only questions (SharePoint only), claim history questions (Salesforce only), or hybrid questions (both sources) — a lightweight router agent classifies each incoming query and routes it to the appropriate retrieval path(s). This avoids unnecessary API calls and keeps latency low for single-source queries.

**Supporting Pattern: Memory-Enabled Agent (Session Context)**

Within a single agent session (one customer call), the system maintains conversational context so follow-up questions like "What about water damage specifically?" resolve against the prior exchange without the agent repeating the full question. Context is scoped to the session and cleared at session end; no cross-session customer data is retained in the AI layer (full data remains in Salesforce).

**Supporting Pattern: Human-in-the-Loop Validation**

The system is explicitly designed as a decision-support tool, not an autonomous actor. Every response is presented as a suggestion with sources; the human agent validates and decides what to communicate to the customer. Thumbs-up/down feedback feeds a continuous improvement loop. Flagged responses are routed to team leads for review.

---

## 6. Proposed L1 Architecture

### User Interface Layer

The agent-facing interface is a sidebar chat widget embedded within the existing agent desktop application. It is built as a React web component deliverable as an iframe or micro-frontend that can be injected into any browser-based agent desktop (Salesforce Lightning, custom CRM, or standalone). The widget has three zones: a query input field, a response panel showing the synthesized answer with inline citations, and a source panel showing the retrieved document excerpts with links back to their origin (SharePoint URL or Salesforce record URL). A thumbs-up/down feedback control sits below each response. Optional filters (policy line, date range) are accessible via a collapsible panel.

### Agent Orchestration Layer

A Python-based orchestration service built on LangGraph manages the query lifecycle. On receiving a query, the orchestration layer:
1. Invokes the Router Agent to classify the query type (policy, claims, hybrid)
2. Dispatches parallel retrieval tasks to the SharePoint retrieval tool and/or the Salesforce retrieval tool based on the routing decision
3. Assembles retrieved chunks into a ranked context window, applying a reranking step to prioritize the most relevant excerpts
4. Constructs the LLM prompt with system instructions, session history, retrieved context, and the user query
5. Calls the LLM API and streams the response back to the UI
6. Logs the full interaction (query, retrieved chunks, response, metadata) to the audit store
7. Returns the response along with source metadata for citation rendering

### LLM/Model Layer

The primary LLM is GPT-4o via Azure OpenAI Service, chosen for its strong instruction-following, long-context handling (up to 128K tokens), and enterprise compliance posture available through the Azure tenant. For the embedding model, text-embedding-3-large (also via Azure OpenAI) is used to encode both documents at index time and queries at retrieval time in the same embedding space. For the router classification step, GPT-4o-mini is used to keep latency and cost low for the lightweight classification task.

### Tool/API Integration Layer

Two primary retrieval tools are registered in the orchestration layer:

- **SharePoint Tool:** Calls the Microsoft Graph API to retrieve document content for chunks identified by the vector search. The tool handles authentication via a service principal with read-only delegated permissions to the target SharePoint sites.
- **Salesforce Tool:** Calls the Salesforce REST API (or Apex REST endpoints) to retrieve Case records, Case comments, and related activity notes for a given account or claim ID. The agent's session provides the customer/claim context; the tool fetches only records scoped to that context.

### Data Ingestion Layer

A scheduled ingestion pipeline runs every 4 hours (or triggered by SharePoint webhook on document update). The pipeline:
1. Connects to SharePoint Online via Microsoft Graph API and enumerates changed documents since the last run
2. Downloads updated documents (PDF, DOCX, HTML) and passes them through a document parser (PyMuPDF for PDF, python-docx for Word, BeautifulSoup for HTML)
3. Splits documents into overlapping chunks (512 tokens, 50-token overlap) using a semantic chunking strategy that respects paragraph and section boundaries
4. Generates vector embeddings for each chunk via Azure OpenAI embeddings API
5. Upserts chunk vectors and metadata (document title, URL, section, last-modified date) into the vector store

Salesforce data is not pre-indexed — it is retrieved live at query time to ensure freshness. This is intentional: claim notes change frequently and staleness would create a compliance risk.

### Retrieval/Indexing Layer

The vector store is Azure AI Search (formerly Cognitive Search) with vector search enabled. It stores SharePoint document chunks as vector embeddings alongside their metadata. At query time, the system performs a hybrid search combining semantic vector similarity (cosine distance) and BM25 keyword matching, then applies a cross-encoder reranker to produce the final top-K ranked chunks (K=5 by default, configurable). This hybrid approach handles both semantic paraphrase matches ("Is flood damage covered?" finding chunks about "inundation exclusions") and exact keyword matches for policy codes, clause numbers, or specific terminology.

### Security and Access Control

All agents authenticate to the AI assistant via Azure AD SSO (SAML 2.0 / OpenID Connect) using their existing enterprise credentials. The backend enforces row-level access: the SharePoint tool is scoped to documents the agent's role is permitted to read (using SharePoint permission groups mapped to agent roles). The Salesforce tool requires the agent to provide a customer/claim ID from their active session — it does not perform open searches across all claims. All LLM API calls go to Azure OpenAI Service within the same Azure tenant, so data does not leave the enterprise's Azure boundary. PII in retrieved claim notes is flagged by a lightweight classifier before prompt assembly; flagged PII fields are replaced with tokens (e.g., `[CLAIMANT_NAME]`) in the context sent to the LLM, then de-tokenized in the response before display.

### Observability and Logging

All interactions are logged to Azure Monitor / Log Analytics: query text, routing decision, retrieved chunk IDs and scores, LLM response, latency at each step, and agent feedback. LangSmith (or an open-source equivalent, Langfuse) is used for LLM-specific tracing: prompt content, token counts, model version, cost per query. Dashboards in Azure Monitor surface: average response latency, retrieval relevance scores, feedback rates by query category, and error rates by component. Alerts are configured for: p95 latency > 8 seconds, error rate > 2%, vector store connection failures.

### Human-in-the-Loop Controls

The system is advisory only — agents see AI-generated responses but make all customer-facing decisions themselves. Source citations are mandatory on every response; agents can click through to the originating document. A "Flag this response" button routes flagged responses to a team lead review queue. Team leads can mark responses as correct/incorrect and add corrective annotations, which feed into the prompt refinement and retrieval tuning workflow. For high-risk query categories (e.g., coverage denial implications), a visual indicator prompts the agent to verify with a supervisor before communicating to the customer.

### Deployment/Runtime Environment

The backend orchestration service runs as a containerized Python application (Docker) deployed to Azure Container Apps. The ingestion pipeline runs on Azure Functions (timer trigger + event trigger). The vector store is Azure AI Search. The frontend React widget is deployed as a static build to Azure Static Web Apps with CDN. All components sit within a single Azure Virtual Network; the Container Apps environment uses private endpoints for Azure AI Search and Azure OpenAI, so no traffic traverses the public internet.

### Evaluation and Feedback Loop

Response quality is evaluated on three dimensions: retrieval relevance (are the top-K chunks actually relevant to the query?), answer faithfulness (does the response accurately reflect the retrieved content?), and agent utility (thumbs-up/down feedback rate). A weekly automated evaluation pipeline runs a golden dataset of 100 representative queries against the live system and scores results using an LLM-as-judge approach. Retrieval relevance is tracked via NDCG@5. Faithfulness is scored by GPT-4o comparing the response against the source chunks. These metrics feed a continuous improvement board reviewed monthly by the knowledge manager and platform team.

---

## 7. Architecture Components

| Component | Technology | Purpose |
|-----------|------------|---------|
| Agent Chat Widget | React (TypeScript) | Browser-based sidebar UI for agent queries and response display |
| API Gateway | Azure API Management | Rate limiting, auth enforcement, and routing for backend services |
| Orchestration Service | Python / LangGraph | Query routing, retrieval orchestration, prompt assembly, LLM invocation |
| Router Agent | GPT-4o-mini (Azure OpenAI) | Classifies query type: policy-only, claims-only, or hybrid |
| SharePoint Retrieval Tool | Microsoft Graph API | Fetches document content for retrieved chunks |
| Salesforce Retrieval Tool | Salesforce REST API | Fetches live claim records, case notes, and activity history |
| Embedding Service | text-embedding-3-large (Azure OpenAI) | Encodes documents and queries into vector space |
| Vector Store | Azure AI Search | Stores SharePoint chunk vectors and metadata; serves hybrid retrieval |
| Reranker | Azure AI Search semantic ranker | Cross-encoder reranking of retrieved chunks |
| Primary LLM | GPT-4o (Azure OpenAI) | Synthesizes grounded responses from retrieved context |
| PII Classifier | Azure AI Language (PII detection) | Identifies and masks PII in retrieved claim content before LLM prompt |
| Document Ingestion Pipeline | Azure Functions + Python | Pulls SharePoint updates, parses, chunks, embeds, and upserts to vector store |
| Document Parser | PyMuPDF, python-docx, BeautifulSoup | Extracts text from PDF, DOCX, and HTML documents |
| Audit Log Store | Azure Log Analytics | Stores full query-response-source logs for compliance |
| LLM Observability | Langfuse (self-hosted) | LLM-specific tracing: prompts, tokens, cost, latency |
| Feedback Store | Azure PostgreSQL | Stores agent thumbs-up/down feedback and team lead annotations |
| Identity Provider | Azure Active Directory | SSO for agent authentication (SAML 2.0 / OIDC) |
| Secrets Management | Azure Key Vault | Stores API keys, service principal credentials, connection strings |
| Deployment Platform | Azure Container Apps | Hosts orchestration service; auto-scales on request volume |
| Static Frontend Host | Azure Static Web Apps | Hosts the React widget build with CDN edge delivery |
| Session Memory Store | Redis (Azure Cache for Redis) | Stores per-session conversation history; TTL-scoped to session |

---

## 8. Data Flow

1. **Agent initiates query:** The agent types a question into the chat widget sidebar, optionally providing the active customer/claim ID from their CRM context. The widget sends a POST request to the API Gateway with the query, session ID, and optional claim context.

2. **Authentication and authorization:** Azure API Management validates the agent's Azure AD bearer token. The request is forwarded to the Orchestration Service. The service retrieves the agent's role and permitted SharePoint site scope from the token claims.

3. **Session context retrieval:** The Orchestration Service fetches the current session's conversation history from Redis (keyed by session ID). Recent turns are prepended to provide conversational context.

4. **Query routing:** The Router Agent (GPT-4o-mini) analyzes the query and classifies it as: (a) policy-only, (b) claims-history-only, or (c) hybrid. This classification determines which retrieval paths are activated.

5. **Parallel retrieval — SharePoint path (if activated):**
   - The query is encoded into a vector embedding via the Azure OpenAI embeddings API
   - A hybrid search (vector + BM25) is issued to Azure AI Search, filtered to the agent's permitted SharePoint sites
   - The semantic reranker scores and ranks the top-10 candidate chunks
   - The top-5 ranked chunks are returned with their metadata (document title, URL, section, page number)

6. **Parallel retrieval — Salesforce path (if activated):**
   - The Salesforce Retrieval Tool calls the Salesforce REST API, scoped to the claim/account ID from the agent's context
   - It retrieves: Case fields (status, type, amount), Case Comments, and related Email/Call activity feed items
   - The most recent and most relevant records (by date and text relevance) are selected, up to a configured token budget

7. **PII masking:** Retrieved Salesforce content passes through the Azure AI Language PII detector. Identified PII entities (names, addresses, SSNs, phone numbers) are replaced with typed tokens (e.g., `[PERSON_NAME]`, `[SSN]`). A token-to-value map is held in memory for de-tokenization after LLM response generation.

8. **Prompt assembly:** The Orchestration Service constructs the LLM prompt:
   - System prompt: role definition, output format instructions, citation requirements
   - Session history: last N turns from Redis
   - Retrieved policy chunks (labeled with source document and section)
   - Retrieved claim records (labeled as Salesforce data, PII-masked)
   - User query

9. **LLM invocation:** The assembled prompt is sent to GPT-4o via Azure OpenAI. The response streams back to the Orchestration Service and is forwarded to the UI for real-time streaming display.

10. **PII de-tokenization:** As the response streams, the Orchestration Service replaces tokens (e.g., `[PERSON_NAME]`) with their original values for display to the agent. (Agents are authorized to see this data; the masking was only for the LLM boundary.)

11. **Source metadata assembly:** The response is paired with source metadata: SharePoint chunks include document title, URL, and section; Salesforce records include case number and record URL.

12. **Response delivery:** The final response with inline citations and source links is delivered to the agent widget. The streaming display resolves to the full answer; source documents are listed in the source panel.

13. **Session update:** The new turn (query + response) is appended to the Redis session store with a refreshed TTL.

14. **Audit logging:** The full interaction record — query, routing decision, retrieved chunk IDs and scores, masked prompt, response, latency per step, model version, token counts — is written to Azure Log Analytics.

15. **Feedback capture:** If the agent clicks thumbs-up or thumbs-down, the rating is stored in Azure PostgreSQL linked to the interaction record. Thumbs-down triggers an optional comment prompt and optionally creates a review queue item for the team lead.

---

## 9. Model and Prompting Strategy

**Model Assignments**

| Task | Model | Rationale |
|------|-------|-----------|
| Query routing (classification) | GPT-4o-mini | Lightweight classification task; low cost and latency matter here |
| Query embedding | text-embedding-3-large | Best-in-class semantic alignment for insurance domain vocabulary |
| Response synthesis | GPT-4o (128K context) | Strong instruction following; handles large retrieved context; citation compliance |
| PII detection | Azure AI Language | Purpose-built NER for PII; no LLM cost or latency overhead |
| Evaluation (LLM-as-judge) | GPT-4o | Weekly batch job; quality over speed |

**Prompting Approach**

The system prompt for the response synthesis LLM establishes:
- Role: "You are an AI assistant for insurance customer service agents. Your job is to help agents find accurate answers in policy documents and claim records."
- Behavior: Answer only from the provided context. If the context does not contain the answer, say so explicitly — do not invent policy language.
- Citation requirement: Every factual claim must be followed by an inline citation in the format `[Source: {document_title}, Section: {section_name}]` or `[Source: Salesforce Case #{case_number}]`.
- Tone: Clear, professional, concise. Write for an agent who needs to act on the answer, not for an academic audience.
- Uncertainty: If the retrieved context is ambiguous or contradictory, surface the ambiguity explicitly and recommend the agent escalate.

Few-shot examples are included in the system prompt for two representative query types: a pure policy coverage question and a hybrid policy-plus-claim-history question. This stabilizes output format without requiring fine-tuning.

**Context Window Strategy**

GPT-4o's 128K context window is managed as follows:
- System prompt: ~800 tokens (fixed)
- Session history: last 4 turns, capped at 2,000 tokens
- Retrieved SharePoint chunks: top-5, target 4,000 tokens total (800 tokens/chunk average)
- Retrieved Salesforce records: target 2,000 tokens
- Query: ~100 tokens
- Total: ~9,000 tokens, well within the 128K limit, with headroom for complex queries

If a query triggers a large corpus of Salesforce records, the Salesforce retrieval tool applies a TF-IDF relevance filter to stay within the 2,000-token budget for that source.

**Output Format**

Responses are returned as structured JSON from the LLM with two fields: `answer` (the synthesized prose with inline citations) and `confidence` (HIGH / MEDIUM / LOW, self-assessed by the LLM based on the quality of retrieved context). The UI renders the `answer` field and displays the `confidence` as a visual indicator. JSON mode is enforced on the Azure OpenAI API call.

**Temperature and Sampling**

Temperature is set to 0.1 for the synthesis LLM — low temperature is critical for a factual retrieval task where consistency and citation accuracy matter more than creativity. The router classification LLM also uses temperature 0.0 for deterministic classification.

---

## 10. Tools, APIs, and Integrations

| Tool/API | Purpose | Auth Method | Data Sensitivity |
|----------|---------|-------------|-----------------|
| Microsoft Graph API (SharePoint) | Enumerate and download SharePoint documents for ingestion; fetch chunk content at query time | OAuth 2.0 client credentials (service principal) with read-only Sites.Read.All permission | Internal — policy documents, not PII |
| Salesforce REST API | Retrieve Case records, comments, and activity notes scoped to active claim | OAuth 2.0 connected app (JWT bearer flow) with read-only profile | High — contains customer PII and claim details |
| Azure OpenAI Service — GPT-4o | Primary response synthesis LLM | API key (stored in Key Vault); Azure AD managed identity preferred | High — receives (PII-masked) retrieved content |
| Azure OpenAI Service — GPT-4o-mini | Query router classification | API key (Key Vault) | Low — receives query text only |
| Azure OpenAI Service — text-embedding-3-large | Document and query embedding | API key (Key Vault) | Medium — document chunks and query text |
| Azure AI Search | Vector + keyword retrieval over SharePoint corpus | Azure AD managed identity | Internal — policy document chunks |
| Azure AI Language (PII Detection) | Detect and mask PII in Salesforce-retrieved content before LLM prompt | Azure AD managed identity | High — processes raw claim content |
| Azure Cache for Redis | Session conversation history store | Connection string (Key Vault) | Medium — contains conversation context |
| Azure PostgreSQL | Feedback and annotation storage | Connection string (Key Vault) | Low — contains ratings and annotations, no PII |
| Azure Log Analytics | Audit and observability logging | Azure AD managed identity | High — full query/response audit trail |
| Langfuse (self-hosted on Azure Container Apps) | LLM tracing and prompt monitoring | API key | High — LLM prompts may contain masked content |
| Azure Active Directory | Agent SSO and authorization | SAML 2.0 / OIDC | High — identity provider |
| Azure Key Vault | Secrets management | Azure AD managed identity | Critical — all secrets stored here |
| Azure API Management | API gateway, rate limiting, auth enforcement | Validates Azure AD JWT | Low — metadata only at this layer |

---

## 11. Security, Roles, and Permissions

**Authentication**

All agents authenticate via Azure Active Directory SSO using OpenID Connect. The React widget initiates a silent MSAL token acquisition using the agent's existing Windows/browser session — no separate login required. Backend services authenticate to each other and to Azure resources using Managed Identity where possible (no stored credentials).

**Authorization Model**

Role-Based Access Control (RBAC) is applied at two levels:
1. **SharePoint retrieval scope:** Agent roles (mapped from Azure AD groups) determine which SharePoint sites and document libraries are searchable. A tier-1 agent cannot retrieve documents from a site restricted to underwriters.
2. **Salesforce retrieval scope:** The Salesforce API call is scoped to the claim/account ID explicitly provided by the agent from their active CRM session. The Salesforce service account has read-only access; no bulk query capability is exposed.

**Data Residency and Privacy**

All Azure resources are provisioned in a single region (e.g., East US or West Europe) to meet data residency requirements. Azure OpenAI Service is used instead of the public OpenAI API to ensure data does not leave the Azure tenant and to benefit from Azure's enterprise data processing agreement. The insurer's DPA with Microsoft should be confirmed to cover AI workloads.

**PII Handling**

Customer PII from Salesforce (names, addresses, SSNs, phone numbers, policy numbers) is detected by Azure AI Language before the content reaches the LLM API. PII fields are replaced with typed tokens for LLM processing; de-tokenization occurs in-memory before display to the authenticated agent. PII is never written to Langfuse or any third-party observability tool. Audit logs in Log Analytics contain query metadata but not the full prompt content with PII — a separate, access-controlled log stream stores full prompts for compliance investigations only.

**Audit Logging**

All query-response interactions are logged with: timestamp, agent ID (hashed), session ID, query text, routing decision, chunk IDs retrieved (not chunk content in the primary log), model used, response hash, and feedback rating. Logs are retained for 7 years in Azure Log Analytics with tiered storage (hot 90 days, cold archive thereafter). Access to logs requires a separate compliance-reader Azure AD role.

**Secrets Management**

All API keys, connection strings, and credentials are stored in Azure Key Vault. Application services retrieve secrets at startup via Key Vault references; secrets are never embedded in configuration files or environment variables in container images. Key rotation procedures are documented and tested quarterly.

**Network Security**

The Azure Container Apps environment is deployed in a dedicated virtual network. Azure AI Search and Azure OpenAI endpoints are accessed via Azure Private Endpoints — no traffic traverses the public internet for LLM or retrieval calls. Azure API Management is deployed in front of the public-facing agent widget API endpoint with TLS 1.3 enforcement, IP allowlisting to the corporate network range (or VPN gateway), and DDoS protection enabled.

---

## 12. POC Scope

**In Scope for POC**

- A working end-to-end RAG pipeline: SharePoint ingestion → chunking → embedding → Azure AI Search → LLM synthesis → response with citations
- A single SharePoint site with one document library (select 500–1,000 representative policy documents)
- Salesforce integration for one Case object type (e.g., homeowners claims) with Case Comments and basic Case fields
- React chat widget deployable as a standalone web app (not yet embedded in the agent desktop)
- Query routing between policy-only, claims-only, and hybrid paths
- Session memory for follow-up questions within a single browser session
- Thumbs-up/down feedback capture
- Basic audit logging to Azure Log Analytics
- PII masking for Salesforce content

**Out of Scope for POC**

- Embedding in the production agent desktop (integration deferred to MVP)
- Full SharePoint corpus ingestion (only one pilot site)
- Multi-language support
- Role-based SharePoint access scoping (all POC users see the same document scope)
- Semantic ranker / advanced reranking (basic vector search only in POC)
- Full compliance-grade audit log retention (7-year archive)
- Automated evaluation pipeline
- Production SLAs or high availability

**POC Success Criteria**

1. Agents can ask natural language questions and receive cited responses within 5 seconds for 90% of queries
2. Retrieved source documents are relevant to the query (>80% relevance rating in a structured 50-query evaluation set)
3. Responses accurately reflect source document content with no significant factual contradictions (verified by a domain expert reviewing 25 randomly sampled responses)
4. Salesforce claim data is correctly scoped to the queried claim/account (no cross-claim data leakage in 100 test cases)
5. At least 5 agents participate in a structured usability session and report the tool is "useful" or "very useful"

**Required Sample Data**

- 500–1,000 policy documents from one SharePoint document library (actual production documents, not synthetic)
- 50–100 Salesforce Case records with associated comments (anonymized or from a Salesforce sandbox with representative data)
- A golden test set of 50 questions with reference answers, curated by a domain expert

**Estimated POC Duration:** 6 weeks

---

## 13. POC Technical Design

**Tech Stack**

- Frontend: React (TypeScript) + Vite, deployed to Azure Static Web Apps
- Backend: Python 3.12, FastAPI, deployed to Azure Container Apps
- Agent Framework: LangGraph (for orchestration state machine)
- LLM: GPT-4o via Azure OpenAI Service (response synthesis); GPT-4o-mini (router)
- Embeddings: text-embedding-3-large via Azure OpenAI Service
- Vector Store: Azure AI Search (Basic tier for POC)
- Session Store: Azure Cache for Redis (C1 tier)
- Document Parsing: PyMuPDF (PDF), python-docx (DOCX)
- Package Management: uv
- Observability: Langfuse (deployed as Azure Container App alongside the main service)
- Infrastructure: Bicep templates for Azure resource provisioning
- CI/CD: GitHub Actions (build, lint, deploy)

**Implementation Steps**

1. **Week 1 — Infrastructure and Connectivity:** Provision Azure resources (Container Apps, AI Search, Azure OpenAI, Redis, Key Vault) via Bicep. Establish Microsoft Graph API service principal with read access to the pilot SharePoint site. Establish Salesforce connected app with JWT bearer auth scoped to Case objects. Verify end-to-end connectivity.

2. **Week 2 — Ingestion Pipeline:** Build the SharePoint document ingestion pipeline: enumerate documents via Graph API, parse with PyMuPDF/python-docx, chunk with LangChain text splitters, embed with text-embedding-3-large, upsert to Azure AI Search. Run full ingestion of the pilot document set. Validate retrieval quality with 20 manual queries.

3. **Week 3 — Orchestration and Retrieval:** Build the LangGraph orchestration graph: router node, SharePoint retrieval node, Salesforce retrieval node, PII masking node, prompt assembly node, LLM synthesis node, logging node. Implement the FastAPI backend with streaming response support. Unit test each node independently.

4. **Week 4 — Frontend and Integration:** Build the React chat widget (query input, streaming response display, source citations, thumbs feedback). Connect frontend to backend API. Implement MSAL authentication (Azure AD). End-to-end happy path working.

5. **Week 5 — Testing and Refinement:** Run the 50-question golden test set. Measure retrieval relevance and response faithfulness. Tune: chunk size, top-K, system prompt language. Fix any Salesforce scoping or PII masking gaps. Conduct structured usability sessions with 5 agents.

6. **Week 6 — Hardening and Demo Prep:** Address usability feedback. Finalize logging. Write deployment documentation. Prepare the demo scenario. Conduct internal QA. Present POC results to stakeholders.

**Demo Flow**

A stakeholder observing the demo will see:

1. An agent receives a simulated customer call about a homeowners claim. The agent enters the customer's claim ID into the chat widget sidebar.
2. The agent types: "Is water damage from a burst pipe covered under this policy, and has the customer had a similar claim before?"
3. Within 4 seconds, the response appears — synthesized prose citing the relevant homeowners policy section (with a link to the SharePoint document) and summarizing the prior claim note from Salesforce (with a link to the Salesforce Case).
4. The agent follows up: "What about mold resulting from the water damage?"
5. The system responds with a more specific policy excerpt about mold coverage limitations, in context of the prior answer.
6. The agent clicks through to the source SharePoint document, which opens in a new tab showing the exact section.
7. The stakeholder is shown the Langfuse trace: prompt, retrieved chunks, token count, latency breakdown, and cost per query.
8. The agent rates the response thumbs-up. The rating appears in the Azure Log Analytics dashboard.

---

## 14. Suggested Project Structure

```
insurance-claims-assistant/
├── README.md
├── pyproject.toml                  # uv-managed dependencies
├── uv.lock
├── .env.example                    # template for local dev env vars
├── .github/
│   └── workflows/
│       ├── ci.yml                  # lint, test, type-check
│       └── deploy.yml              # build and deploy to Azure Container Apps
├── infra/
│   ├── main.bicep                  # top-level Azure resource orchestration
│   ├── modules/
│   │   ├── container-apps.bicep
│   │   ├── ai-search.bicep
│   │   ├── openai.bicep
│   │   ├── redis.bicep
│   │   └── key-vault.bicep
│   └── parameters/
│       ├── dev.json
│       └── prod.json
├── src/
│   ├── main.py                     # FastAPI app entry point
│   ├── agents/
│   │   ├── __init__.py
│   │   ├── orchestrator.py         # LangGraph state machine definition
│   │   ├── router.py               # Query routing agent (GPT-4o-mini)
│   │   └── synthesizer.py          # Response synthesis agent (GPT-4o)
│   ├── tools/
│   │   ├── __init__.py
│   │   ├── sharepoint_retrieval.py # Microsoft Graph API retrieval tool
│   │   ├── salesforce_retrieval.py # Salesforce REST API retrieval tool
│   │   └── pii_masker.py           # Azure AI Language PII detection + masking
│   ├── prompts/
│   │   ├── system_prompt.txt       # Primary synthesis system prompt
│   │   ├── router_prompt.txt       # Router classification prompt
│   │   └── few_shot_examples.json  # Few-shot examples for synthesis
│   ├── api/
│   │   ├── __init__.py
│   │   ├── routes/
│   │   │   ├── query.py            # POST /query endpoint (streaming)
│   │   │   └── feedback.py         # POST /feedback endpoint
│   │   └── middleware/
│   │       ├── auth.py             # Azure AD JWT validation
│   │       └── logging.py          # Request/response audit logging
│   ├── ingestion/
│   │   ├── __init__.py
│   │   ├── pipeline.py             # Main ingestion orchestration
│   │   ├── sharepoint_client.py    # Microsoft Graph API client
│   │   ├── document_parser.py      # PDF, DOCX, HTML parsers
│   │   └── chunker.py              # Text splitting and chunking logic
│   └── retrieval/
│       ├── __init__.py
│       ├── vector_store.py         # Azure AI Search client (upsert + query)
│       ├── embedder.py             # Azure OpenAI embeddings wrapper
│       └── reranker.py             # Semantic reranking logic
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── ChatWidget.tsx      # Main widget container
│   │   │   ├── QueryInput.tsx      # Query input with filters
│   │   │   ├── ResponsePanel.tsx   # Streaming response with citations
│   │   │   ├── SourcePanel.tsx     # Source document list
│   │   │   └── FeedbackBar.tsx     # Thumbs-up/down + flag controls
│   │   ├── hooks/
│   │   │   └── useStreamingQuery.ts # SSE streaming hook
│   │   └── auth/
│   │       └── msalConfig.ts       # MSAL Azure AD configuration
│   └── public/
├── tests/
│   ├── unit/
│   │   ├── test_router.py
│   │   ├── test_chunker.py
│   │   ├── test_pii_masker.py
│   │   └── test_retrieval.py
│   ├── integration/
│   │   ├── test_ingestion_pipeline.py
│   │   └── test_query_endpoint.py
│   └── evaluation/
│       ├── golden_dataset.json     # 50-question evaluation set
│       └── run_eval.py             # Automated evaluation runner
└── docs/
    ├── architecture.md             # This document
    ├── deployment.md               # Step-by-step deployment guide
    ├── runbook.md                  # Operational runbook
    └── data-dictionary.md          # SharePoint fields, Salesforce objects
```

---

## 15. MVP Evolution Path

| Dimension | POC | MVP | Production |
|-----------|-----|-----|-----------|
| Users | 5–10 pilot agents | 50–100 agents (1–2 teams) | 500+ agents enterprise-wide |
| Auth | Azure AD SSO (manual MSAL config) | Azure AD SSO with agent desktop SSO integration | Enterprise IAM with MFA enforcement, conditional access |
| Integration | Standalone web app (separate tab) | Embedded widget in agent desktop (iframe/microfrontend) | Native integration with Salesforce Lightning / agent platform SDK |
| SharePoint Coverage | 1 site, 1 document library | 5–10 sites, all policy lines | Full SharePoint tenant, all document libraries |
| Salesforce Coverage | Case fields + Case Comments, 1 object type | Cases, Opportunities, Contacts, custom claim objects | Full Salesforce data model per agent role |
| Retrieval Quality | Basic vector search, no reranking | Hybrid search (vector + BM25) + semantic reranker | Hybrid search + reranker + domain fine-tuned embedding model |
| Monitoring | Console logs + basic Langfuse traces | Azure Monitor dashboards, Langfuse, alerting | Full observability stack with SLO tracking, PagerDuty integration |
| Error Handling | Basic try/catch, fail-fast | Retry logic on Azure OpenAI and Graph API calls | Circuit breakers, graceful degradation, fallback to keyword search |
| Data Freshness | 4-hour scheduled ingestion | 1-hour scheduled + SharePoint webhook triggers | Real-time webhook ingestion with < 15-minute document lag |
| Security | Dev-mode PII masking | Hardened PII masking, audit logs enabled, network controls | Full compliance audit package, pen test completed, SOC 2 alignment |
| Evaluation | Manual 50-question golden set review | Weekly automated evaluation pipeline | Continuous evaluation, A/B testing for prompt/model changes |
| Cost Management | None (engineer monitors manually) | Azure cost alerts, per-query cost tracking | FinOps tagging, chargeback by team, cost-per-query SLA |

**POC → MVP Narrative**

The POC proves the core retrieval-synthesis loop works with real data. Moving to MVP involves three major additions: (1) embedding the widget in the production agent desktop via the agent platform's extensibility API, eliminating the context-switch; (2) expanding SharePoint coverage to all major policy lines, requiring ingestion pipeline scaling and role-based document scoping; and (3) adding advanced retrieval (hybrid search + reranker) to close the quality gap on technical policy queries. MVP also introduces proper SRE practices: retry logic, circuit breakers on external API calls, and monitoring dashboards that the team lead can access without engineering involvement.

**MVP → Production Narrative**

Production readiness requires: completing the compliance package (pen test, data residency confirmation, 7-year audit log retention with tiered storage), scaling the Container Apps environment to handle 500 concurrent users with auto-scaling policies, deploying to a secondary region for availability, completing the full SharePoint and Salesforce object coverage, and launching a continuous evaluation pipeline that alerts when retrieval quality drops below threshold. A domain-adapted embedding model (fine-tuned on insurance vocabulary) should be evaluated at this stage, as it typically yields a 5–10% improvement in retrieval relevance for technical insurance language.

---

## 16. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| LLM response contains policy language that is subtly wrong or outdated, leading agent to give incorrect guidance | M | H | Mandatory source citations on every response; confidence indicator for low-relevance retrievals; training agents to verify before communicating; regular golden-set evaluation to catch regressions |
| SharePoint document corpus is poorly structured (inconsistent formatting, scanned PDFs without OCR) reducing retrieval quality | H | M | Run corpus audit before ingestion; add OCR pipeline (Azure AI Document Intelligence) for scanned PDFs; work with knowledge manager to tag high-value documents |
| Salesforce API rate limits exceeded under 500-agent concurrent load | M | H | Salesforce API calls are per-query and scoped (not bulk); implement per-agent API call queuing; negotiate higher API limits with Salesforce or use Salesforce Connect for cached access |
| PII masking misses novel PII patterns in claim notes | M | H | Use layered approach: Azure AI Language + regex patterns for known PII formats; quarterly review of masking coverage; log PII detection confidence scores for audit |
| Agents over-trust AI responses and stop verifying policy documents | M | H | Design UI to always surface source citations; training materials emphasize "verify before communicating"; team lead review queue for flagged responses |
| Azure OpenAI capacity limits cause latency spikes during peak agent shifts | L | M | Reserve Azure OpenAI provisioned throughput (PTUs) for production workload; implement token bucket rate limiting per agent to smooth demand |
| SharePoint permissions complexity prevents correct role-based document scoping | M | M | Map agent Azure AD groups to SharePoint permission groups in the POC phase; build and test scoping logic before MVP with real permission structures |
| Ingestion pipeline falls behind on high document-update days (e.g., policy releases) | L | M | Add SharePoint webhook trigger for immediate re-ingestion on document change; monitor ingestion queue depth; alert if lag exceeds 8 hours |
| Regulatory change requires system re-certification | L | H | Document architecture decisions and data flows for audit readiness from POC; engage compliance team as stakeholders from week 1; design for auditability not as an afterthought |
| Key personnel dependency on niche LangGraph/Azure stack knowledge | M | M | Document all orchestration logic thoroughly; cross-train two engineers on the full stack; avoid proprietary abstractions that only one person understands |

---

## 17. Success Criteria

**POC Success**

- End-to-end query-to-response latency < 5 seconds for 90% of test queries (measured over 50 representative queries)
- Retrieval relevance: > 80% of top-5 retrieved chunks rated "relevant" or "highly relevant" by domain expert on the 50-question golden set
- Response faithfulness: < 5% of responses contain a factual claim not supported by the retrieved source documents (LLM-as-judge + human spot-check)
- Salesforce scoping accuracy: 100% of test cases return claim data scoped correctly to the queried account (zero cross-account data leakage)
- Agent usability: > 80% of pilot agents rate the tool "useful" or "very useful" in post-session survey (N=5)

**MVP Success**

- Active usage: > 70% of enrolled agents (50–100) use the tool at least 3 times per shift within 4 weeks of launch
- Handle time reduction: Average customer handle time for claims-related queries reduced by 15%+ compared to pre-tool baseline (measured over 4-week period)
- Feedback rate: > 60% of agent queries receive a thumbs-up or thumbs-down rating (indicating engagement)
- Availability: System uptime > 99.5% during business hours over 30-day measurement period
- Thumbs-up rate: > 75% of rated responses receive thumbs-up

**Production Success**

- Productivity: Agent time-on-search reduced from 40% to < 20% of shift time (measured via agent desktop activity analytics over 90 days)
- Scale: System handles 500 concurrent agents with p95 response latency < 5 seconds
- Quality: Monthly automated evaluation NDCG@5 score > 0.75 (maintained over 6 months)
- Compliance: Zero PII incidents (data leakage events) over 12-month operating period
- Adoption: > 85% of all 500+ agents active weekly users within 6 months of full rollout
- Business value: Equivalent of 50+ FTE-hours recovered per day across the agent pool (calculated from productivity improvement data)

---

## 18. Next Steps

Prioritized action items for the next 2 weeks:

1. **[Day 1–2] Stakeholder alignment meeting:** Confirm the POC scope with the business sponsor, compliance officer, and IT lead. Get agreement on the pilot SharePoint site, Salesforce object types, and the 5-agent pilot group.

2. **[Day 1–3] Answer open questions:** Have IT confirm the Azure subscription and Azure OpenAI availability. Have the Salesforce admin confirm which objects contain claim notes and whether a connected app can be created. Have compliance confirm PII handling requirements for LLM calls.

3. **[Day 2–4] Corpus audit:** Knowledge manager enumerates the pilot SharePoint document library. Assess: total document count, format distribution (PDF vs. DOCX vs. HTML), proportion of scanned vs. text-native PDFs, average document length, update frequency. Determines whether OCR preprocessing is needed.

4. **[Day 3–5] Azure environment provisioning:** IT provisions the Azure subscription / resource group. Architect deploys the Bicep templates for the POC environment (Container Apps, AI Search, Azure OpenAI, Redis, Key Vault). Validate connectivity to SharePoint and Salesforce from the Azure VNet.

5. **[Day 4–7] Service account setup:** IT creates the Microsoft Graph API service principal with Sites.Read.All on the pilot SharePoint site. Salesforce admin creates the connected app with JWT bearer flow and read-only Case profile. Both credentials are stored in Key Vault. End-to-end connectivity test for both APIs.

6. **[Week 2] Golden dataset creation:** Domain expert (senior claims agent or policy specialist) authors 50 representative question-answer pairs from the pilot SharePoint site scope, covering: coverage questions, exclusion questions, claims history questions, and hybrid questions. This dataset is needed for Week 5 evaluation.

7. **[Week 2] Kick off ingestion pipeline development:** Engineering team begins Week 2 implementation work (document ingestion pipeline) in parallel with environment setup. Use sample documents to unblock development before full SharePoint access is ready.

8. **[Ongoing] Compliance review:** Engage the compliance officer to review the PII masking design and audit logging specification. Get written sign-off before any Salesforce data is processed by the LLM layer. Identify whether a formal Data Protection Impact Assessment (DPIA) is required.
