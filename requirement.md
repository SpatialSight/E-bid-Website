# Software Requirements Document: PC Parts Auction Platform (Version 1.0 - Local Dev)

## 1. Project Overview
This document outlines the requirements for a mobile-first online auction platform designed for used computer components. The platform aims to provide a dedicated, structured, and engaging environment for PC building hobbyists to buy and sell parts, moving away from the unstructured nature of social media groups. The core user experience will be a "TikTok-style" vertical feed for browsing and bidding on items.

## 2. Business Objectives
* **Primary Goal:** To create a centralized and trusted marketplace connecting sellers and buyers of used computer parts.
* **Business Value:** Facilitate transactions within the PC hobbyist community, providing a superior alternative to informal social media bidding.
* **Key Success Metrics:**
    * Total volume of completed transactions.
    * Number of daily/monthly active users.

## 3. Target Users & Roles
* **Seller:** An individual PC building hobbyist who lists used computer parts for auction.
* **Buyer:** An individual PC building hobbyist who bids on and purchases used computer parts.
* **Administrator:** The platform owner who has full control to manage users, listings, disputes, and site settings.
* **Moderator:** A privileged user focused on content quality, reviewing listings, and moderating comments to maintain community standards.

## 4. User Stories & Functional Requirements

### Seller Stories
* **Story 1 (Listing Creation):** "As a **Seller**, I want to provide a title, category, condition, description, and photos for my computer part **so that** potential buyers have a clear and accurate understanding of what I am selling."
* **Story 2 (Auction Configuration):** "As a **Seller**, I want to set a starting price, auction duration, and optional reserve or 'Buy It Now' prices **so that** I can control the terms of the sale."
* **Story 3 (Fulfilment):** "As a **Seller**, I want to define shipping costs and specify acceptable Cash on Delivery (COD) locations **so that** buyers have clear options for how they can receive the item."
* **Story 4 (Listing Management):** "As a **Seller**, I want to preview my listing before it goes live and be able to edit it **so that** I can ensure all information is correct."
* **Story 5 (Seller Reporting):** "As a **Seller**, I want the ability to report a non-paying or unresponsive winner to the platform administrators **so that** I can flag bad actors and help maintain the community's integrity."

### Buyer Stories
* **Story 6 (Feed Browsing):** "As a **Buyer**, I want to browse listings by swiping up in a full-screen vertical feed **so that** I can quickly and engagingly discover new items."
* **Story 7 (At-a-Glance Info):** "As a **Buyer**, I want to see the most critical auction details (current price, time left, number of bids) overlaid on the item image **so that** I can assess its status immediately."
* **Story 8 (Placing a Bid):** "As a **Buyer**, I want to tap a button to open a simple bidding window **so that** I can place a bid quickly without leaving the browsing feed."
* **Story 9 (Viewing Full Details):** "As a **Buyer**, I want to be able to easily navigate from the feed view to a full details page **so that** I can read the complete description and review shipping options before committing to a serious bid."
* **Story 10 (Watchlist - Saving an Item):** "As a **Buyer**, I want to tap a **star button** on an item in the feed **so that** I can save it to my personal watchlist for later."
* **Story 11 (Watchlist - Viewing Saved Items):** "As a **Buyer**, I want to access a dedicated 'Watchlist' screen or page from my profile **so that** I can view all the items I have saved in one place."
* **Story 12 (Watchlist - Notifications):** "As a **Buyer**, I want to receive a notification when an auction for an item on my watchlist is about to end **so that** I don't miss the opportunity to place a final bid."
* **Story 13 (Fair Bidding System):** "As a **Buyer**, I want to be able to place a maximum bid (proxy bidding) and participate in auctions that extend with last-minute bids **so that** I have a fair chance to win without having to constantly monitor the auction or lose to a last-second snipe."
* **Story 14 (Winner Contact):** "As a **Buyer** who has won an auction, I want a simple button to start a WhatsApp conversation with the seller **so that** I can efficiently organize payment and delivery."

### Admin & System Stories
* **Story 15 (Admin Moderation):** "As an **Administrator**, I need to see a queue of user reports and have the tools to review cases and block users **so that** I can effectively moderate the platform and remove problematic accounts."
* **Story 16 (Concurrency & Fairness):** "As a **System**, I must process all bids in the exact order they are received, using atomic transactions to prevent race conditions. The system must provide immediate and clear feedback to all bidders, ensuring the highest valid bid is always accepted and that the bidding process is fair even under high load."

## 5. Non-Functional Requirements
* **Performance:**
    * **Instant Feed Loading:** The browsing feed must load the next item instantly upon swipe with no noticeable lag.
    * **Real-time Updates:** Bids, bid counters, and auction timers must update in real-time for all connected users.
* **Usability:**
    * **Mobile-First Design:** The UI/UX must be optimized primarily for a vertical mobile phone experience.
    * **Infinite Loop Feed:** The browsing feed should loop back to the beginning after the last item is shown.
    * **Simple Registration:** For local development, user registration will be handled with a standard username/password.
* **Security:**
    * **Standard Authentication:** User accounts will be secured via username and a hashed password.

## 6. Constraints & Assumptions
* **Assumption 1 (Off-Platform Payments):** For the initial version, all payments and logistics will be handled by the buyer and seller directly (facilitated via WhatsApp). The platform will not process payments.
* **Assumption 2 (Local File Storage):** For initial local development, user-uploaded images will be stored on the local file system of the server.
* **Constraint 1 (Mobile-First):** The initial design and development effort must prioritize the mobile application experience.
* **Technology Suggestions (for development team review):**
    * **Frontend:** React Native
    * **Backend:** Node.js (with Express)
    * **Database:** PostgreSQL (primary) + Redis (caching/real-time)
    * **Real-Time Engine:** Socket.IO