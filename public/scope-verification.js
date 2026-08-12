(function () {
  "use strict";

  var GROUPS = [
    { id: "A", title: "Creating a plan", blurb: "Wizard, cascading invites, polls, and plan extras", items: [
      { id:"A1", name:"Create a plan with the wizard", what:"Set a title, pick a date and time (5-minute increments), add a location, write a description, and attach a cover image. Every plan requires at least a location or description before invites can go out.", verify:"Create a plan from scratch. Fill in all the fields and confirm each step saves." },
      { id:"A2", name:"Cascading invites", what:"Set an invitation order and the app invites one person (or wave) at a time. Preview the cascade before sending, and edit it while live — reorder, resend, change response windows — without affecting anyone who already accepted.", verify:"Add several people in order. Preview the cascade, send it, then reorder someone in the queue while it’s running." },
      { id:"A3", name:"Anonymous polls", what:"For group decisions, everyone privately rates each option (love / good / rather not). A consensus meter shows how the group is leaning. No one can see individual votes. Polls can resolve by deadline, host pick, or runoff.", verify:"Create a poll, vote from a non-host account, and confirm only group totals are visible. Resolve the poll." },
      { id:"A4", name:"RSVP questions, wishlist, and calendar", what:"Ask custom questions when people RSVP (answers visible only to the host). Link out to a registry or wishlist. Guests can add the event to Google Calendar in one tap.", verify:"Add an RSVP question and a wishlist link. As a guest, answer the question and add to calendar." },
    ]},

    { id: "B", title: "Sharing plans", blurb: "Invite links, RSVP flow, and link previews", items: [
      { id:"B1", name:"Share links work for anyone", what:"New plans have sharing on by default. The link shows the full plan — cover image, location, dates, description, calendar — to anyone, no account needed. The URL on the host’s page is tappable, with Copy and Share buttons.", verify:"Copy a share link, open it in a private/signed-out browser. Confirm you see the full plan without signing in." },
      { id:"B2", name:"RSVP flow and undecided dates", what:"Viewing is open; RSVPing requires signing in. After sign-in you land back on the same plan. After accepting, an ‘Open the plan’ link takes you to the full event. Links also work when the date is still being polled.", verify:"Open a link signed out, tap RSVP, sign in, and confirm you land back on the plan. Try one with an open date poll." },
      { id:"B3", name:"Link previews in messaging apps", what:"Pasting a Switchboard link into iMessage, WhatsApp, Slack, or similar shows a branded preview card with title, description, and image.", verify:"Paste a plan’s share link into a messaging app and confirm a preview card appears." },
    ]},

    { id: "C", title: "During the event", blurb: "Living rooms, announcements, attendees, and re-invites", items: [
      { id:"C1", name:"Living rooms", what:"A group chat that auto-sorts what you drop in — addresses go to Addresses, links to Links, tasks to Tasks, notes to Notes, photos to Photos. Everything updates live for all members.", verify:"Paste an address, a link, and a photo into a room. Confirm they file into the right tabs and appear live on another account." },
      { id:"C2", name:"Host announcements and attendee list", what:"Host broadcasts (door code, running late) appear on the event page, in the room, and in notifications. Every attendee is tappable with contact or invite options.", verify:"Post an announcement and confirm it shows in all three places. Tap an attendee’s name and confirm options appear." },
      { id:"C3", name:"Run It Back", what:"Re-invite the same crew into a fresh plan in one step, automatically dropping anyone who said it wasn’t their thing.", verify:"From a past event, tap Run It Back and confirm the crew is pre-loaded minus anyone who passed." },
    ]},

    { id: "D", title: "Discovery and matching", blurb: "AI suggestions, moments, mutual signals, and availability", items: [
      { id:"D1", name:"AI-powered discovery", what:"Describe what you’re looking for and the app returns fitting activities you can turn into a plan in one tap. Toggle between solo and social modes, and ‘open to meeting people.’ The intent launchpad lets you choose: ‘I’ve got a plan,’ ‘Help me figure it out,’ or ‘Find something to do.’", verify:"Open Explore, describe an experience, and confirm you get suggestions. Try both solo and social modes." },
      { id:"D2", name:"Moments (three-step consent matching)", what:"Check in somewhere. If someone else is there, you each move through three consent steps (open, curious, matched) before either person is revealed. A match drops you into a shared room. Check-ins can be geo-tagged on the map.", verify:"Two accounts check into the same place. Step through the consent flow and confirm a shared room opens on match." },
      { id:"D3", name:"Mutual signals", what:"‘Down to Connect’ lets you privately signal interest — the other person only learns about it if they signal back. Availability signals (‘I’m free’) are visible only to circles you choose and auto-expire.", verify:"Have two accounts express mutual interest and confirm the reveal. Raise an availability signal to one circle and confirm others can’t see it." },
    ]},

    { id: "E", title: "Map and zones", blurb: "Zones, live location, and map layers", items: [
      { id:"E1", name:"Zones and presence", what:"Named places you check into — a conference, a campus, a festival. Zone presence counts show how many people are currently there. Give a zone a location and it appears on the map.", verify:"Create a zone, check in from two accounts, and confirm each sees the other in the count. Confirm the zone shows on the map." },
      { id:"E2", name:"Live location sharing", what:"Opt in and appear live on the map. It’s mutual (you only see people who can see you), respects blocks, is blurred to roughly 110 meters, and turns itself off automatically.", verify:"Two accounts opt in. Confirm they see each other, confirm the blurring, and confirm auto-off." },
      { id:"E3", name:"Map navigation", what:"Plans, zones, and shared places are independent toggleable layers. Tapping a layer count opens a sorted directory with links to each item. The map stays where you pan it — GPS updates don’t snap it back.", verify:"Toggle each layer. Tap a layer count and confirm a directory opens. Pan the map and confirm it stays put." },
    ]},

    { id: "F", title: "People and safety", blurb: "Circles, connections, blocking, give-space, and onboarding", items: [
      { id:"F1", name:"Circles and connections", what:"Manage circles from the People page — add and remove members, rename, change the emoji. Send connect requests (the recipient is notified) and resend pending ones.", verify:"Open a circle, add and remove a member, rename it. Send a connect request and confirm the recipient is notified." },
      { id:"F2", name:"Safety tools", what:"Block removes someone from discovery, matching, and the map — enforced for real. Give Space quietly warns you if someone you’d rather avoid is at a plan. Report and Block are reachable from profiles, rooms, moments, and connect requests.", verify:"Block an account and confirm they disappear. Use Give Space and confirm the warning. Find Report from a profile and from a room member." },
      { id:"F3", name:"Onboarding, search, and sharing the app", what:"New users see a getting-started card (add a friend, make a plan, send a signal). People search explains that email/phone lookup requires verified contacts and suggests searching by handle. You can share Switchboard itself without creating a plan first.", verify:"Confirm the getting-started card appears for a new user. Search by email and confirm the guidance. Find the ‘Invite to Switchboard’ option." },
    ]},

    { id: "G", title: "Boards and community", blurb: "Invite-only local groups with posts and events", items: [
      { id:"G1", name:"Invite-only boards", what:"Members-only local groups. Moderators can create and rotate shareable join links. Non-members can’t see the content.", verify:"Confirm a non-member can’t see a board. Join via a link. As a moderator, rotate the code and confirm the old one stops working." },
      { id:"G2", name:"Board posts and community landing", what:"Posts show the first date of a happening. Authors can edit their own posts (title, details, schedule, location). The label says ‘Recurring announcement.’ A community landing page leads into boards.", verify:"Create a board post, edit it, and confirm the label. Open the Community page and confirm it shows available boards." },
    ]},

    { id: "H", title: "Account and settings", blurb: "Sign-in, profile, settings, phone verification, and deletion", items: [
      { id:"H1", name:"Sign-in and account recovery", what:"Create an account, sign in, and reset your password. Each problem gets an honest, specific message: unconfirmed email says to check your inbox (with a re-send button), suspended accounts say so, rate limits say to wait. None of these pretend the password was wrong. No combination of account state is a dead end.", verify:"Sign in successfully. If possible, try an unconfirmed or expired-link scenario and confirm the message is specific and offers a next step." },
      { id:"H2", name:"Onboarding and profile", what:"New users are guided through interests and circles before reaching the rest of the app (even via deep links). Users must confirm they are 18+ and accept the latest terms. Edit your own profile (photo, bio, interests) and view others’ public profiles.", verify:"Sign in with a fresh account and confirm you’re guided through setup. Edit your profile and visit someone else’s." },
      { id:"H3", name:"Settings and phone verification", what:"Settings changes show a ‘Saved’ confirmation (or a visible error if the save fails). Add and verify a phone number via SMS. Choose what you’re notified about. Old URLs and bookmarks redirect to switchboardsocial.me.", verify:"Change a setting, confirm ‘Saved’ appears, and reload to verify it stuck. Add a phone number and complete SMS verification." },
      { id:"H4", name:"Account deletion", what:"Delete your account and see a clear confirmation that it was removed.", verify:"Delete a throwaway account and confirm the deletion banner appears." },
    ]},

    { id: "I", title: "Notifications and polish", blurb: "Notification inbox, realtime, error messages, and app install", items: [
      { id:"I1", name:"Notifications", what:"A persistent inbox so nothing is lost. Room messages send bundled notifications (skipping anyone already looking at the room). New poll options notify existing voters so they can reconsider.", verify:"Send a room message and confirm the other member gets a notification. Add a poll option and confirm voters are notified." },
      { id:"I2", name:"Realtime updates", what:"Rooms, moments, matches, and polls all update live — no refresh needed. Poll votes highlight instantly.", verify:"With two accounts, trigger updates on different surfaces and confirm they appear live." },
      { id:"I3", name:"Error messages", what:"When something goes wrong, the message says what happened and includes a diagnostic code (like SB-INVITE-EXPIRED). Server errors don’t blame you or suggest retrying.", verify:"If you encounter an error, confirm it’s specific and has a diagnostic code." },
      { id:"I4", name:"App install, features, and quality of life", what:"Installable on your phone’s home screen with a real icon. A searchable feature catalogue answers ‘what can this do?’ The home page greeting matches your time of day. Family and caregiver activity options are available. Legal pages (privacy, terms, copyright) are in place.", verify:"Install on your home screen. Open the Features page and search for something. Confirm the greeting matches your time zone." },
    ]},
  ];

  var TOTAL = 0;
  GROUPS.forEach(function(g) { TOTAL += g.items.length; });

  var KEY = "swb-scope-v4";
  var state = {};
  try { state = JSON.parse(localStorage.getItem(KEY)) || {}; } catch(e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch(e) {} }

  var root = document.getElementById("groups");

  document.getElementById("grpCnt").textContent = GROUPS.length;

  function renderGroups() {
    root.innerHTML = "";
    GROUPS.forEach(function(g) {
      var groupDone = g.items.filter(function(it) { return state[it.id]; }).length;
      var groupTotal = g.items.length;
      var pct = groupTotal ? Math.round(groupDone / groupTotal * 100) : 0;
      var isFull = groupDone === groupTotal;

      var card = document.createElement("div");
      card.className = "group";

      card.innerHTML =
        '<button class="group-head">' +
          '<div class="gh-icon">' + g.id + '</div>' +
          '<div class="gh-text"><h3>' + esc(g.title) + '</h3><div class="gh-blurb">' + esc(g.blurb) + '</div></div>' +
          '<span class="gh-count' + (isFull ? ' full' : '') + '">' + groupDone + ' / ' + groupTotal + '</span>' +
          '<span class="gh-chev">&#9656;</span>' +
        '</button>' +
        '<div class="group-body">' +
          '<div class="group-bar-track"><i style="width:' + pct + '%"></i></div>' +
        '</div>';

      var body = card.querySelector(".group-body");
      g.items.forEach(function(it) {
        var checked = state[it.id];
        var el = document.createElement("div");
        el.className = "item" + (checked ? " done" : "");
        el.innerHTML =
          '<div class="item-check"><input type="checkbox" class="chk" data-id="' + it.id + '"' + (checked ? ' checked' : '') + '></div>' +
          '<div class="item-body">' +
            '<div class="item-top">' +
              '<span class="item-id">' + it.id + '</span>' +
              '<span class="item-name">' + esc(it.name) + '</span>' +
            '</div>' +
            '<div class="item-what">' + esc(it.what) + '</div>' +
            '<div class="item-verify"><span class="vl">Try it</span><span>' + esc(it.verify) + '</span></div>' +
          '</div>';
        body.appendChild(el);
      });

      card.querySelector(".group-head").addEventListener("click", function() {
        card.classList.toggle("collapsed");
      });

      root.appendChild(card);
    });

    root.addEventListener("change", function(e) {
      if (e.target.classList.contains("chk")) {
        var id = e.target.getAttribute("data-id");
        if (e.target.checked) { state[id] = true; } else { delete state[id]; }
        save();
        updateCounts();
        var item = e.target.closest(".item");
        if (item) item.classList.toggle("done", e.target.checked);
        var group = e.target.closest(".group");
        if (group) updateGroupCount(group);
      }
    });
  }

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function updateCounts() {
    var done = Object.keys(state).length;
    var left = TOTAL - done;
    var pct = TOTAL ? Math.round(done / TOTAL * 100) : 0;

    document.getElementById("cntDone").textContent = done;
    document.getElementById("cntLeft").textContent = left;
    document.getElementById("revDone").textContent = done;
    document.getElementById("revTotal").textContent = TOTAL;
    document.getElementById("revBar").style.width = pct + "%";
    document.getElementById("stkFill").style.width = pct + "%";
    document.getElementById("stickyCount").innerHTML =
      '<span>' + done + '</span><span class="muted"> / ' + TOTAL + '</span>';
  }

  function updateGroupCount(groupEl) {
    var checks = groupEl.querySelectorAll(".chk");
    var d = 0;
    checks.forEach(function(c) { if (c.checked) d++; });
    var t = checks.length;
    var cnt = groupEl.querySelector(".gh-count");
    cnt.textContent = d + " / " + t;
    cnt.classList.toggle("full", d === t);
    var bar = groupEl.querySelector(".group-bar-track i");
    if (bar) bar.style.width = (t ? Math.round(d/t*100) : 0) + "%";
  }

  renderGroups();
  updateCounts();

  document.getElementById("expandAll").addEventListener("click", function() {
    document.querySelectorAll(".group").forEach(function(g) { g.classList.remove("collapsed"); });
  });
  document.getElementById("collapseAll").addEventListener("click", function() {
    document.querySelectorAll(".group").forEach(function(g) { g.classList.add("collapsed"); });
  });
  document.getElementById("resetBtn").addEventListener("click", function() {
    if (confirm("Reset all checkboxes?")) {
      state = {}; save();
      renderGroups(); updateCounts();
    }
  });
})();
