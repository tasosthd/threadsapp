let currentUser = null;
let currentProfile = null;

/* =========================
   USER META
========================= */

function getUserMeta(user) {
  const meta = user?.user_metadata || {};
  const username = meta.username ? cleanUsername(meta.username) : "";
  const fullName = String(meta.full_name || meta.name || "").trim();

  return {
    name: fullName || username || "User",
    username,
    email: user?.email || "",
    avatar: meta.avatar_url || meta.picture || fallbackAvatar(fullName || username || user?.email || "User")
  };
}

/* =========================
   EXPIRED SESSION / JWT SAFETY
========================= */

function isExpiredAuthError(error) {
  const message = String(error?.message || error || "").toLowerCase();

  return (
    message.includes("jwt expired") ||
    message.includes("invalid jwt") ||
    message.includes("expired token") ||
    message.includes("refresh token not found") ||
    message.includes("session not found")
  );
}

function cleanAuthErrorMessage(message) {
  return isExpiredAuthError(message)
    ? "Your session expired. Please log in again."
    : message;
}

function clearStoredSupabaseAuthTokens() {
  try {
    Object.keys(localStorage).forEach((key) => {
      const normalizedKey = key.toLowerCase();

      if (
        normalizedKey.startsWith("sb-") ||
        normalizedKey.includes("supabase") ||
        normalizedKey.includes("auth-token")
      ) {
        localStorage.removeItem(key);
      }
    });
  } catch (error) {
    console.warn("Could not clear local Supabase auth storage:", error);
  }
}

async function handleExpiredSession(error) {
  if (!isExpiredAuthError(error)) return false;

  if (window.__loomyvaHandlingExpiredSession) return true;
  window.__loomyvaHandlingExpiredSession = true;

  currentUser = null;
  currentProfile = null;
  clearStoredSupabaseAuthTokens();

  try {
    await supabaseClient.auth.signOut({ scope: "local" });
  } catch (signOutError) {
    console.warn("Expired session cleanup recovered:", signOutError);
  }

  updateSharedAuthUI();
  setStatus("Your session expired. Please log in again.", "error");

  if (!isAuthPage()) {
    window.setTimeout(() => {
      window.location.href = "/login/?expired=1";
    }, 650);
  }

  return true;
}

/* =========================
   PROFILE UPSERT
========================= */

async function upsertProfile() {
  if (!currentUser) return;

  const meta = getUserMeta(currentUser);

  const defaultUsername = meta.username
    ? cleanUsername(meta.username)
    : meta.email
      ? cleanUsername(meta.email.split("@")[0])
      : `user_${currentUser.id.slice(0, 8)}`;

  const defaultFullName = meta.name || defaultUsername || "Loomyva User";

  const { data: existingProfile, error: selectError } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (selectError) {
    if (await handleExpiredSession(selectError)) return;
    setStatus(cleanAuthErrorMessage(selectError.message), "error");
    return;
  }

  const profilePayload = {
    id: currentUser.id,
    email: meta.email,
    full_name: existingProfile?.full_name || defaultFullName,
    username: existingProfile?.username || defaultUsername,

    /*
      Important:
      Keep custom uploaded avatar if it exists.
      Only use Google avatar if the user has never uploaded one.
    */
    avatar_url: existingProfile?.avatar_url || meta.avatar,

    bio: existingProfile?.bio || "",
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabaseClient
    .from("profiles")
    .upsert(profilePayload, { onConflict: "id" })
    .select()
    .single();

  if (error) {
    if (await handleExpiredSession(error)) return;
    setStatus(cleanAuthErrorMessage(error.message), "error");
    return;
  }

  currentProfile = data;

  updateSharedAuthUI();
}

/* =========================
   AUTH UI
========================= */

function updateSharedAuthUI() {
  const loginButtons = Array.from(document.querySelectorAll("#loginBtn, [data-auth-login]"));
  const googleLoginButtons = Array.from(document.querySelectorAll("#googleLoginBtn, [data-google-login]"));
  const logoutButtons = Array.from(document.querySelectorAll("#logoutBtn, [data-logout]"));
  const emailAuthForms = Array.from(document.querySelectorAll("#emailAuthForm, [data-auth-form]"));
  const authDividers = Array.from(document.querySelectorAll(".auth-divider"));

  const userBoxes = Array.from(document.querySelectorAll("#userBox, [data-user-box]"));
  const userAvatars = Array.from(document.querySelectorAll("#userAvatar, [data-user-avatar]"));
  const userNames = Array.from(document.querySelectorAll("#userName, [data-user-name]"));
  const userEmails = Array.from(document.querySelectorAll("#userEmail, [data-user-email]"));

  const showLoggedOutUI = () => {
    document.body.classList.remove("is-logged-in");
    loginButtons.forEach((el) => el.classList.remove("hidden"));
    googleLoginButtons.forEach((el) => el.classList.remove("hidden"));
    emailAuthForms.forEach((el) => el.classList.remove("hidden"));
    authDividers.forEach((el) => el.classList.remove("hidden"));

    userBoxes.forEach((el) => el.classList.add("hidden"));
    userAvatars.forEach((el) => { el.src = ""; });
    userNames.forEach((el) => { el.textContent = "User"; });
    userEmails.forEach((el) => { el.textContent = "@username"; });
    logoutButtons.forEach((el) => { el.disabled = false; });
  };

  if (!currentUser) {
    showLoggedOutUI();
    return;
  }

  const meta = getUserMeta(currentUser);

  const avatar =
    currentProfile?.avatar_url ||
    meta.avatar ||
    fallbackAvatar(meta.name || meta.username || "User");

  const name =
    currentProfile?.full_name ||
    meta.name ||
    currentProfile?.username ||
    meta.username ||
    "User";

  const username =
    currentProfile?.username ||
    meta.username ||
    "";

  document.body.classList.add("is-logged-in");
  loginButtons.forEach((el) => el.classList.add("hidden"));
  googleLoginButtons.forEach((el) => el.classList.add("hidden"));
  emailAuthForms.forEach((el) => el.classList.add("hidden"));
  authDividers.forEach((el) => el.classList.add("hidden"));

  userBoxes.forEach((el) => el.classList.remove("hidden"));
  userAvatars.forEach((el) => { el.src = avatar; });
  userNames.forEach((el) => { el.textContent = name; });
  userEmails.forEach((el) => {
    el.textContent = username ? `@${username}` : "";
  });
  logoutButtons.forEach((el) => { el.disabled = false; });
}


/* =========================
   SAFE AUTH UI REFRESH
========================= */

async function refreshSharedAuthUIFromSession() {
  try {
    const { data, error } = await supabaseClient.auth.getSession();

    if (error) {
      console.warn("Could not refresh sidebar auth session:", error);
      updateSharedAuthUI();
      return;
    }

    currentUser = data.session?.user || null;

    if (currentUser && !currentProfile) {
      const { data: profileData, error: profileError } = await supabaseClient
        .from("profiles")
        .select("*")
        .eq("id", currentUser.id)
        .maybeSingle();

      if (!profileError && profileData) {
        currentProfile = profileData;
      }
    }

    updateSharedAuthUI();
  } catch (error) {
    console.warn("Sidebar auth refresh recovered:", error);
    updateSharedAuthUI();
  }
}

/* =========================
   EMAIL AUTH HELPERS
========================= */

function getEmailAuthFields() {
  const emailInput = document.getElementById("authEmail");
  const fullNameInput = document.getElementById("authFullName");
  const usernameInput = document.getElementById("authUsername");
  const passwordInput = document.getElementById("authPassword");

  const email = emailInput ? emailInput.value.trim() : "";
  const fullName = fullNameInput ? fullNameInput.value.trim().replace(/\s+/g, " ") : "";
  const rawUsername = usernameInput ? usernameInput.value.trim() : "";
  const username = rawUsername ? cleanUsername(rawUsername) : "";
  const password = passwordInput ? passwordInput.value : "";

  return { email, fullName, username, password };
}

function validateEmailAuth(email, password) {
  if (!email || !password) {
    setStatus("Please enter your email and password.", "error");
    return false;
  }

  if (!email.includes("@") || !email.includes(".")) {
    setStatus("Please enter a valid email address.", "error");
    return false;
  }

  if (password.length < 6) {
    setStatus("Password must be at least 6 characters.", "error");
    return false;
  }

  return true;
}

function validateSignupProfileFields(fullName, username) {
  if (!fullName || fullName.length < 2) {
    setStatus("Please enter your full name before creating an account.", "error");
    return false;
  }

  if (fullName.length > 60) {
    setStatus("Full name must be 60 characters or less.", "error");
    return false;
  }

  if (!username) {
    setStatus("Please choose a username before creating an account.", "error");
    return false;
  }

  if (username.length < 3) {
    setStatus("Username must be at least 3 characters.", "error");
    return false;
  }

  if (username.length > 28) {
    setStatus("Username must be 28 characters or less.", "error");
    return false;
  }

  return true;
}

function setButtonLoading(button, isLoading, loadingText, defaultText) {
  if (!button) return;

  button.disabled = isLoading;
  button.textContent = isLoading ? loadingText : defaultText;
}

/* =========================
   EMAIL SIGN IN
========================= */

function isAuthPage() {
  return document.body?.dataset.authPage === "login" || document.body?.dataset.authPage === "signup";
}

function redirectLoggedOutUsersToLogin() {
  // Pages can opt out of the logged-out redirect (e.g. the /post/ page,
  // which keeps its composer + "Sign in to post" card visible for guests).
  const allowsGuests =
    document.body?.dataset.allowGuests === "true" ||
    document.body?.classList.contains("post-only-page");

  if (!currentUser && !isAuthPage() && !allowsGuests) {
    window.location.href = "/login/";
    return true;
  }

  return false;
}

async function signInWithEmailPassword(event) {
  if (event) {
    event.preventDefault();
  }

  setStatus("");

  const { email, password } = getEmailAuthFields();

  if (!validateEmailAuth(email, password)) return;

  const emailLoginBtn = document.getElementById("emailLoginBtn");

  setButtonLoading(emailLoginBtn, true, "Logging in...", "Log in");

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  setButtonLoading(emailLoginBtn, false, "Logging in...", "Log in");

  if (error) {
    setStatus(cleanAuthErrorMessage(error.message), "error");
    return;
  }

  currentUser = data.user || null;

  if (currentUser) {
    await upsertProfile();
  }

  setStatus("Logged in successfully.", "success");

  window.location.href = "/profile/";
}

/* =========================
   EMAIL SIGN UP
========================= */

async function signUpWithEmailPassword(event) {
  if (event) {
    event.preventDefault();
  }

  setStatus("");

  const { email, fullName, username, password } = getEmailAuthFields();

  if (!validateEmailAuth(email, password)) return;
  if (!validateSignupProfileFields(fullName, username)) return;

  const emailSignupBtn = document.getElementById("emailSignupBtn");

  setButtonLoading(emailSignupBtn, true, "Creating account...", "Create account");

  const { data: usernameExists, error: usernameCheckError } = await supabaseClient
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  if (usernameCheckError) {
    setButtonLoading(emailSignupBtn, false, "Creating account...", "Create account");
    setStatus(cleanAuthErrorMessage(usernameCheckError.message), "error");
    return;
  }

  if (usernameExists) {
    setButtonLoading(emailSignupBtn, false, "Creating account...", "Create account");
    setStatus("This username is already taken. Try another one.", "error");
    return;
  }

  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/profile/`,
      data: {
        full_name: fullName,
        name: fullName,
        username
      }
    }
  });

  setButtonLoading(emailSignupBtn, false, "Creating account...", "Create account");

  if (error) {
    setStatus(cleanAuthErrorMessage(error.message), "error");
    return;
  }

  currentUser = data.user || null;

  /*
    If email confirmation is OFF, Supabase returns a session and the user can enter immediately.
    If email confirmation is ON, Supabase returns a user but no session, so they must confirm email first.
  */
  if (data.session && currentUser) {
    await upsertProfile();
    setStatus("Account created successfully.", "success");
    window.location.href = "/profile/";
    return;
  }

  setStatus("Account created. Check your email to confirm your account, then log in.", "success");
}

/* =========================
   GOOGLE SIGN IN
========================= */

async function signInWithGoogle() {
  setStatus("");

  const redirectTo = `${window.location.origin}/profile/`;

  const googleLoginBtn = document.getElementById("googleLoginBtn");
  const loginBtn = document.getElementById("loginBtn");

  setButtonLoading(googleLoginBtn, true, "Opening Google...", "Continue with Google");

  if (loginBtn && loginBtn !== googleLoginBtn) {
    loginBtn.disabled = true;
  }

  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo
    }
  });

  setButtonLoading(googleLoginBtn, false, "Opening Google...", "Continue with Google");

  if (loginBtn && loginBtn !== googleLoginBtn) {
    loginBtn.disabled = false;
  }

  if (error) {
    setStatus(cleanAuthErrorMessage(error.message), "error");
  }
}

/* =========================
   SIGN OUT
========================= */

async function signOut() {
  const logoutBtn = document.getElementById("logoutBtn");

  if (logoutBtn) {
    logoutBtn.disabled = true;
  }

  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    setStatus(cleanAuthErrorMessage(error.message), "error");

    if (logoutBtn) {
      logoutBtn.disabled = false;
    }

    return;
  }

  currentUser = null;
  currentProfile = null;

  updateSharedAuthUI();

  if (typeof closeSidebar === "function") {
    closeSidebar();
  }

  setStatus("");

  if (!isAuthPage()) {
    window.location.href = "/login/";
  }
}

/* =========================
   RESTORE SESSION
========================= */

async function restoreSession() {
  if (typeof supabaseClient === "undefined" || !supabaseClient) {
    currentUser = null;
    currentProfile = null;
    if (typeof updateSharedAuthUI === "function") updateSharedAuthUI();
    return;
  }

  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    if (await handleExpiredSession(error)) return;
    setStatus(cleanAuthErrorMessage(error.message), "error");
    updateSharedAuthUI();
    return;
  }

  currentUser = data.session?.user || null;

  if (currentUser) {
    try {
      await upsertProfile();
    } catch (profileError) {
      console.warn("Profile upsert recovered during restore:", profileError);
    }

    updateSharedAuthUI();

    if (isAuthPage()) {
      window.location.href = "/profile/";
      return;
    }
  } else {
    currentProfile = null;
    updateSharedAuthUI();

    if (redirectLoggedOutUsersToLogin()) {
      return;
    }
  }

  if (isAuthPage() && new URLSearchParams(window.location.search).get("expired") === "1") {
    setStatus("Your session expired. Please log in again.", "error");
    return;
  }

  setStatus("");
}

/* =========================
   AUTH LISTENER
========================= */

function listenForAuthChanges({ onSignedIn, onSignedOut } = {}) {
  supabaseClient.auth.onAuthStateChange((event, session) => {
    setTimeout(async () => {
      currentUser = session?.user || null;

      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        if (currentUser) {
          await upsertProfile();
        }

        updateSharedAuthUI();

        if (typeof onSignedIn === "function") {
          await onSignedIn();
        }
      }

      if (event === "SIGNED_OUT") {
        currentUser = null;
        currentProfile = null;

        updateSharedAuthUI();

        if (typeof onSignedOut === "function") {
          await onSignedOut();
        }
      }
    }, 0);
  });
}

/* =========================
   PASSWORD VISIBILITY TOGGLE
========================= */

function setupPasswordToggle() {
  const passwordInput = document.getElementById("authPassword");
  const togglePasswordBtn = document.getElementById("togglePasswordBtn");

  if (!passwordInput || !togglePasswordBtn) return;

  togglePasswordBtn.addEventListener("click", () => {
    const isVisible = passwordInput.type === "text";

    passwordInput.type = isVisible ? "password" : "text";

    togglePasswordBtn.classList.toggle("is-visible", !isVisible);

    togglePasswordBtn.setAttribute(
      "aria-label",
      isVisible ? "Show password" : "Hide password"
    );
  });
}

/* =========================
   BUTTON SETUP
========================= */

function setupAuthButtons() {
  setupPasswordToggle();

  const loginBtn = document.getElementById("loginBtn");
  const googleLoginBtn = document.getElementById("googleLoginBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  const emailAuthForm = document.getElementById("emailAuthForm");
  const emailLoginBtn = document.getElementById("emailLoginBtn");
  const emailSignupBtn = document.getElementById("emailSignupBtn");

  if (loginBtn) {
    loginBtn.addEventListener("click", signInWithGoogle);
  }

  if (googleLoginBtn) {
    googleLoginBtn.addEventListener("click", signInWithGoogle);
  }

  if (emailAuthForm) {
    const authMode = emailAuthForm.dataset.authMode || document.body?.dataset.authPage || "login";

    if (authMode === "signup") {
      emailAuthForm.addEventListener("submit", signUpWithEmailPassword);
    } else {
      emailAuthForm.addEventListener("submit", signInWithEmailPassword);
    }
  } else if (emailLoginBtn) {
    emailLoginBtn.addEventListener("click", signInWithEmailPassword);
  }

  if (emailSignupBtn && !emailAuthForm) {
    emailSignupBtn.addEventListener("click", signUpWithEmailPassword);
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", signOut);
  }
}
