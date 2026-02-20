/** Human-readable labels for tool calls, keyed by tool name. */
export const toolLabels: Record<string, { active: string; done: string }> = {
  document_list:           { active: "Listing documents",   done: "Listed documents" },
  document_read:           { active: "Reading document",    done: "Read document" },
  document_write:          { active: "Writing document",    done: "Wrote document" },
  http_get:                { active: "Fetching URL",        done: "Fetched URL" },
  send:                    { active: "Sending message",     done: "Sent message" },
  thread_list:             { active: "Listing threads",     done: "Listed threads" },
  thread_read:             { active: "Reading thread",      done: "Read thread" },
  thread_search:           { active: "Searching threads",   done: "Searched threads" },
  thread_summary_expand:   { active: "Expanding summary",   done: "Expanded summary" },
};
