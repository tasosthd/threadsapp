/* Loomyva Real-time Chat
   Requires Supabase Auth + these tables: chat_conversations, chat_participants, chat_messages.
*/
let chatCurrentUser = null;
let chatProfiles = [];
let chatConversations = [];
let activeConversationId = null;
let activeRealtimeChannel = null;
let allMessagesChannel = null;
let chatBooted = false;

function chatT(key, fallback) {
  return typeof t === "function" ? t(key) : fallback;
}

function chatEscape(value) {
  if (typeof escapeHTML === "function") return escapeHTML(value);
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function chatAvatar(profile) {
  if (profile?.avatar_url) return profile.avatar_url;
  if (typeof fallbackAvatar === "function") return fallbackAvatar(profile?.full_name || profile?.username || "Loomyva");
  return "/assets/img/index.png";
}

function chatName(profile) {
  return profile?.full_name || profile?.username || "Loomyva User";
}

async function getChatUser() {
  const { data } = await supabaseClient.auth.getUser();
  chatCurrentUser = data?.user || null;
  return chatCurrentUser;
}

async function loadChatProfiles() {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, username, full_name, avatar_url, bio")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Chat profiles error:", error);
    chatProfiles = [];
    return;
  }

  chatProfiles = data || [];
}

function getProfileById(id) {
  return chatProfiles.find((profile) => profile.id === id) || null;
}

function otherParticipant(conversation) {
  const ids = (conversation.chat_participants || []).map((p) => p.user_id);
  return ids.find((id) => id !== chatCurrentUser?.id) || null;
}

async function loadConversations() {
  if (!chatCurrentUser) return;

  const { data, error } = await supabaseClient
    .from("chat_conversations")
    .select("id, updated_at, created_at, chat_participants(user_id), chat_messages(id, body, sender_id, created_at)")
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Load conversations error:", error);
    chatConversations = [];
    return;
  }

  chatConversations = sortConversationsByLatest((data || []).filter((conversation) => {
    return (conversation.chat_participants || []).some((p) => p.user_id === chatCurrentUser.id);
  }));
}

async function ensureConversation(otherUserId) {
  if (!chatCurrentUser || !otherUserId || otherUserId === chatCurrentUser.id) return null;

  const existing = chatConversations.find((conversation) => {
    const ids = (conversation.chat_participants || []).map((p) => p.user_id).sort().join(":");
    return ids === [chatCurrentUser.id, otherUserId].sort().join(":");
  });

  if (existing) return existing.id;

  const { data: conversation, error: conversationError } = await supabaseClient
    .from("chat_conversations")
    .insert({ created_by: chatCurrentUser.id })
    .select("id")
    .single();

  if (conversationError) throw conversationError;

  const { error: participantError } = await supabaseClient
    .from("chat_participants")
    .insert([
      { conversation_id: conversation.id, user_id: chatCurrentUser.id },
      { conversation_id: conversation.id, user_id: otherUserId }
    ]);

  if (participantError) throw participantError;

  await loadConversations();
  return conversation.id;
}

function renderChatPeople() {
  const peopleWrap = document.getElementById("chatPeopleList");
  const input = document.getElementById("chatSearchInput");
  if (!peopleWrap) return;

  const query = String(input?.value || "").toLowerCase().replace(/^@/, "").trim();
  const people = chatProfiles
    .filter((profile) => profile.id !== chatCurrentUser?.id)
    .filter((profile) => {
      if (!query) return true;
      return String(profile.username || "").toLowerCase().includes(query) ||
        String(profile.full_name || "").toLowerCase().includes(query);
    })
    .slice(0, 12);

  if (!people.length) {
    peopleWrap.innerHTML = `<div class="chat-empty-mini">${chatT("chatNoPeople", "No people found.")}</div>`;
    return;
  }

  peopleWrap.innerHTML = people.map((profile) => `
    <button class="chat-person-btn" type="button" data-chat-user-id="${chatEscape(profile.id)}">
      <img src="${chatEscape(chatAvatar(profile))}" alt="${chatEscape(chatName(profile))} avatar" />
      <span>
        <strong>${chatEscape(chatName(profile))}</strong>
        <small>@${chatEscape(profile.username || "user")}</small>
      </span>
    </button>
  `).join("");

  peopleWrap.querySelectorAll("[data-chat-user-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      await openConversationWithUser(button.dataset.chatUserId);
    });
  });
}

function formatChatPreviewTime(value) {
  if (!value) return "";
  const date = new Date(value);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();

  if (sameDay) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (date.toDateString() === yesterday.toDateString()) {
    return chatT("yesterday", "Yesterday");
  }

  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function getConversationLastMessage(conversation) {
  const lastMessages = Array.isArray(conversation?.chat_messages) ? conversation.chat_messages : [];

  return lastMessages
    .slice()
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0] || null;
}

function sortConversationsByLatest(conversations) {
  return (conversations || []).slice().sort((a, b) => {
    const lastA = getConversationLastMessage(a);
    const lastB = getConversationLastMessage(b);
    const timeA = new Date(lastA?.created_at || a.updated_at || a.created_at || 0).getTime();
    const timeB = new Date(lastB?.created_at || b.updated_at || b.created_at || 0).getTime();

    return timeB - timeA;
  });
}

function renderConversationList() {
  const list = document.getElementById("chatConversationList");
  if (!list) return;

  if (!chatCurrentUser) {
    list.innerHTML = `<div class="chat-empty-mini">${chatT("chatSignInText", "Sign in to use real-time chat.")}</div>`;
    return;
  }

  const conversations = sortConversationsByLatest(chatConversations);

  if (!conversations.length) {
    list.innerHTML = `
      <div class="chat-empty-mini chat-empty-inbox">
        <strong>${chatT("chatNoConversationsTitle", "No chats yet")}</strong>
        <span>${chatT("chatNoConversations", "Search someone below and start the first conversation.")}</span>
      </div>
    `;
    return;
  }

  list.innerHTML = conversations.map((conversation) => {
    const otherId = otherParticipant(conversation);
    const profile = getProfileById(otherId);
    const last = getConversationLastMessage(conversation);
    const active = conversation.id === activeConversationId ? "active" : "";
    const isOwnLast = last?.sender_id === chatCurrentUser?.id;
    const preview = last
      ? `${isOwnLast ? chatT("chatYouPrefix", "You: ") : ""}${last.body}`
      : chatT("chatNewConversation", "New conversation");
    const time = formatChatPreviewTime(last?.created_at || conversation.updated_at || conversation.created_at);

    return `
      <button class="chat-conversation-btn ${active}" type="button" data-conversation-id="${chatEscape(conversation.id)}">
        <span class="chat-conversation-avatar-wrap">
          <img src="${chatEscape(chatAvatar(profile))}" alt="${chatEscape(chatName(profile))} avatar" />
        </span>
        <span class="chat-conversation-main">
          <span class="chat-conversation-topline">
            <strong>${chatEscape(chatName(profile))}</strong>
            <em>${chatEscape(time)}</em>
          </span>
          <span class="chat-conversation-username">@${chatEscape(profile?.username || "user")}</span>
          <small>${chatEscape(preview)}</small>
        </span>
      </button>
    `;
  }).join("");

  list.querySelectorAll("[data-conversation-id]").forEach((button) => {
    button.addEventListener("click", () => openConversation(button.dataset.conversationId));
  });
}
async function openConversationWithUser(otherUserId) {
  try {
    const conversationId = await ensureConversation(otherUserId);
    await openConversation(conversationId);
  } catch (error) {
    console.error("Open conversation with user error:", error);
    showChatStatus(chatT("chatStartError", "Could not start chat."), true);
  }
}

async function openConversation(conversationId) {
  activeConversationId = conversationId;
  document.getElementById("chatApp")?.classList.add("chat-has-active-conversation");
  renderConversationList();
  renderChatHeader();
  await loadMessages(conversationId);
  subscribeToConversation(conversationId);

  if (window.matchMedia("(max-width: 760px)").matches) {
    document.querySelector(".chat-window")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }
}

function renderChatHeader() {
  const header = document.getElementById("chatActiveHeader");
  if (!header) return;

  const conversation = chatConversations.find((item) => item.id === activeConversationId);
  const profile = getProfileById(otherParticipant(conversation || {}));

  if (!conversation || !profile) {
    header.innerHTML = `
      <div class="chat-active-placeholder">
        <strong>${chatT("chatPickConversation", "Pick a conversation")}</strong>
        <span>${chatT("chatPickConversationText", "Messages will appear live here.")}</span>
      </div>
    `;
    return;
  }

  header.innerHTML = `
    <img src="${chatEscape(chatAvatar(profile))}" alt="${chatEscape(chatName(profile))} avatar" />
    <div>
      <strong>${chatEscape(chatName(profile))}</strong>
      <span>@${chatEscape(profile.username || "user")}</span>
    </div>
  `;
}

async function loadMessages(conversationId) {
  const wrap = document.getElementById("chatMessages");
  if (!wrap || !conversationId) return;

  wrap.innerHTML = `<div class="chat-loading">${chatT("loading", "Loading...")}</div>`;

  const { data, error } = await supabaseClient
    .from("chat_messages")
    .select("id, conversation_id, sender_id, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Messages error:", error);
    wrap.innerHTML = `<div class="chat-empty-mini">${chatT("chatLoadError", "Could not load messages.")}</div>`;
    return;
  }

  renderMessages(data || []);
}

function renderMessages(messages) {
  const wrap = document.getElementById("chatMessages");
  if (!wrap) return;

  if (!activeConversationId) {
    wrap.innerHTML = `<div class="chat-empty-state">${chatT("chatEmptyState", "Choose a chat or search someone to begin.")}</div>`;
    return;
  }

  if (!messages.length) {
    wrap.innerHTML = `<div class="chat-empty-state">${chatT("chatNoMessages", "No messages yet. Send the first one 🚀")}</div>`;
    return;
  }

  wrap.innerHTML = messages.map((message) => {
    const own = message.sender_id === chatCurrentUser?.id ? "own" : "";
    const time = new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return `
      <div class="chat-message ${own}">
        <p>${chatEscape(message.body)}</p>
        <small>${chatEscape(time)}</small>
      </div>
    `;
  }).join("");

  wrap.scrollTop = wrap.scrollHeight;
}

function appendMessage(message) {
  if (!message || message.conversation_id !== activeConversationId) return;
  loadMessages(activeConversationId);
}

async function sendChatMessage(event) {
  event.preventDefault();
  const input = document.getElementById("chatMessageInput");
  const body = String(input?.value || "").trim();

  if (!chatCurrentUser) {
    showChatStatus(chatT("chatSignInText", "Sign in to use real-time chat."), true);
    return;
  }

  if (!activeConversationId) {
    showChatStatus(chatT("chatPickFirst", "Pick someone first."), true);
    return;
  }

  if (!body) return;
  if (body.length > 1000) {
    showChatStatus(chatT("chatTooLong", "Keep messages under 1000 characters."), true);
    return;
  }

  input.value = "";

  const { error } = await supabaseClient
    .from("chat_messages")
    .insert({ conversation_id: activeConversationId, sender_id: chatCurrentUser.id, body });

  if (error) {
    console.error("Send message error:", error);
    input.value = body;
    showChatStatus(chatT("chatSendError", "Message failed."), true);
    return;
  }

  await supabaseClient
    .from("chat_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", activeConversationId);

  await loadConversations();
  renderConversationList();
}

function subscribeToConversation(conversationId) {
  if (activeRealtimeChannel) {
    supabaseClient.removeChannel(activeRealtimeChannel);
  }

  activeRealtimeChannel = supabaseClient
    .channel(`chat_messages_${conversationId}`)
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "chat_messages",
      filter: `conversation_id=eq.${conversationId}`
    }, (payload) => appendMessage(payload.new))
    .subscribe();
}

function subscribeToAllMessages() {
  if (allMessagesChannel) return;

  allMessagesChannel = supabaseClient
    .channel("chat_all_messages")
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "chat_messages"
    }, async () => {
      await loadConversations();
      renderConversationList();
    })
    .subscribe();
}

function showChatStatus(message, isError = false) {
  const status = document.getElementById("chatStatus");
  if (!status) return;
  status.textContent = message;
  status.classList.remove("hidden");
  status.classList.toggle("error", Boolean(isError));
  setTimeout(() => status.classList.add("hidden"), 2600);
}

async function initChatPage() {
  if (chatBooted) return;
  chatBooted = true;

  if (!window.supabaseClient) return;

  await getChatUser();

  const signInCard = document.getElementById("chatSignInCard");
  const app = document.getElementById("chatApp");

  if (!chatCurrentUser) {
    signInCard?.classList.remove("hidden");
    app?.classList.add("hidden");
    return;
  }

  signInCard?.classList.add("hidden");
  app?.classList.remove("hidden");

  await loadChatProfiles();
  await loadConversations();

  renderChatPeople();
  renderConversationList();
  renderChatHeader();
  renderMessages([]);
  subscribeToAllMessages();

  const params = new URLSearchParams(window.location.search);
  const userId = params.get("user");
  if (userId) {
    await openConversationWithUser(userId);
  }
}

function bindChatPageUI() {
  document.getElementById("chatSearchInput")?.addEventListener("input", renderChatPeople);
  document.getElementById("chatMessageForm")?.addEventListener("submit", sendChatMessage);
  document.querySelectorAll("[data-open-chat-login]").forEach((button) => {
    button.addEventListener("click", () => {
      if (typeof openSidebar === "function") openSidebar();
    });
  });

  window.addEventListener("loomyva:language-change", () => {
    renderChatPeople();
    renderConversationList();
    renderChatHeader();
  });
}

async function bootChat() {
  bindChatPageUI();
  await initChatPage();
}

function openChatWithUser(userId) {
  if (!userId) return;
  window.location.href = `/messages/?user=${encodeURIComponent(userId)}`;
}
