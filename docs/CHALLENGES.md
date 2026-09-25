# JustGO — Level 1 challenges

**Updated:** September 24, 2026

**Content status:** Finalized in discussion with Anthony, including the latest revisions. This is a human-readable content reference, not an import file. Creating this document does not insert challenges into the database.

## Scope and behavior

- **Venues:** Streets, Park, Gym, Cafe, Bookstore, and Bars & Clubs, selected through pills across the top of the deck.
- **Count:** 61 venue cards: 10 each for Streets, Park, Cafe, Bookstore, and Bars & Clubs; 11 for Gym. This is a count of venue placements, not necessarily unique shared challenges.
- **Difficulty:** Level 1, the easiest version. Each challenge starts an interaction with a small greeting, comment, or question. Continuing the conversation is optional.
- **Duration:** Five-minute attempt window for all cards. The interaction may be much shorter; reaching zero does not automatically mark the attempt failed or completed.
- **Subtext:** The accompanying line below the challenge text. Example wording can be adapted naturally; bracketed words such as `[item]` or `[name]` are conversational placeholders.
- **Venue stacks:** Each user has an independent card order for each venue. Completing a card moves it to the back of that venue's stack. A shared challenge's card in another venue stays in place. Each new accepted repetition has its own attempt history.
- **Shared content:** A challenge can supply content for multiple venue cards without coupling their ordering. The overlap index below identifies related actions while preserving the reviewed wording for every card.

The earlier no-replay and grouped-venue proposals are superseded by the venue list and cycling-stack decisions above. The app's consuming implementation and plan must reflect these decisions when phase 04 is implemented.

## Subtext writing guidance

**Use the subtext to remove the person's most likely hesitation about starting.** The challenge says what to do; the subtext helps them begin. This guidance applies when creating new cards and reviewing existing ones. The card wording below is preserved pending review of individual revisions.

- **Default to an example opening line** when phrasing is the likely obstacle. Make it natural, short, and easy to say. For example, an equipment-sharing challenge can offer: “Hey, would you mind if I worked in with you?”
- **Use context when timing or approach is the obstacle.** A useful cue might be “Catch them between sets or while they’re taking a break.” Use a situation the person can recognize before accepting; do not make them wait for an unlikely event.
- **Use specific reassurance when the expected effort is unclear.** For example: “A quick compliment is enough—you don’t have to keep talking.” This should clarify what is sufficient, not promise a positive response.
- **Avoid merely repeating words already supplied by the challenge.** If the challenge is “Tell someone their dog is cute,” another version of “Your dog is cute” adds little; context or reassurance is usually more useful. A spoken example is still valuable when it translates an instruction into easier, more natural wording.
- **Keep Level 1 small.** Do not turn a greeting into a required conversation or add mandatory follow-up questions. Any suggested continuation must be clearly optional.
- **Prefer practical help over generic encouragement.** “You’ve got this” or “Follow your curiosity” should not take the place of a useful opener, timing cue, or explanation of what is enough.
- **Keep one main purpose per subtext.** Usually one short sentence or opener is enough. Include a brief timing cue alongside an opener only when both help; avoid a paragraph of instructions.
- **Make examples adaptable.** They are suggestions, not scripts to recite exactly. Do not depend on unverified weather, familiarity, preferences, or circumstances. Use the actual situation and keep any placeholders easy to fill.

When generating or assessing a subtext, ask:

1. What is most likely to make this person hesitate: wording, timing, approach, or uncertainty about how much they need to do?
2. Does this line address that obstacle and add something useful beyond the challenge text?
3. Can they use it to initiate the interaction within the five-minute window, without needing an interaction to have already happened?
4. Does it keep the action at Level 1, with further conversation optional?
5. Can it be shortened without losing the useful help?

## Streets — 10 cards

| Card  | Challenge text                                                  | Subtext                                           |
| ----- | --------------------------------------------------------------- | ------------------------------------------------- |
| ST-01 | Say hello to someone you pass.                                  | A simple “Hey, how’s it going?” works.            |
| ST-02 | Give someone a compliment on their outfit.                      | “Hey, I really like your jacket.”                 |
| ST-03 | Ask someone for directions to a place you want to visit.        | “Excuse me, which way is [place]?”                |
| ST-04 | Ask someone to recommend a coffee place nearby.                 | “Do you know a good coffee spot around here?”     |
| ST-05 | Make a friendly comment about the weather to someone nearby.    | “Finally getting some sunshine, right?”           |
| ST-06 | Tell someone their dog is cute.                                 | “Your dog is so cute!”                            |
| ST-07 | Ask someone where they’d recommend getting lunch.               | “Any good lunch spots around here?”               |
| ST-08 | Ask someone where the nearest convenience store is.             | “Excuse me, is there a convenience store nearby?” |
| ST-09 | Ask someone where they got an item they’re wearing or carrying. | “I like your [item]—where did you get it?”        |
| ST-10 | Give someone a compliment on their shoes.                       | “Hey, those are great shoes.”                     |

## Park — 10 cards

| Card  | Challenge text                                                  | Subtext                                           |
| ----- | --------------------------------------------------------------- | ------------------------------------------------- |
| PK-01 | Say hello to someone passing on the path.                       | A smile and “Hey” are enough.                     |
| PK-02 | Make a friendly comment about the weather to someone nearby.    | “Nice day to be out, isn’t it?”                   |
| PK-03 | Tell someone their dog is cute.                                 | “Your dog is so cute!”                            |
| PK-04 | Ask someone on a bench whether you can sit beside them.         | “Hi, mind if I sit here?”                         |
| PK-05 | Ask someone where they got an item they’re wearing or carrying. | “Hey, where did you get your [item]?”             |
| PK-06 | Ask someone sitting nearby how their day is going.              | “Hey, how’s your day going?”                      |
| PK-07 | Ask someone to recommend a nearby coffee place.                 | “Do you know somewhere good to grab a coffee?”    |
| PK-08 | Give someone a compliment on something they’re wearing.         | Pick something you genuinely like.                |
| PK-09 | Ask a dog owner what kind of dog they have.                     | “Your dog’s lovely—what breed are they?”          |
| PK-10 | Ask someone where the nearest washroom is.                      | “Excuse me, do you know where the washrooms are?” |

## Gym — 11 cards

| Card  | Challenge text                                                   | Subtext                                                           |
| ----- | ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| GY-01 | Smile and ask someone at the front desk how it’s going.          | “Hey, how’s your day going?”                                      |
| GY-02 | Ask someone whether they’re using a piece of equipment you need. | Between sets: “Hey, are you using this?”                          |
| GY-03 | Ask someone how many sets they have left.                        | “Hey, how many sets have you got left?”                           |
| GY-04 | Ask someone how to use a machine you’re unfamiliar with.         | “Hey, do you know how this machine works?”                        |
| GY-05 | Ask someone what an exercise they’re doing is called.            | Between sets: “Hey, what’s that exercise called?”                 |
| GY-06 | Ask someone where to find a piece of equipment.                  | “Hey, do you know where the [equipment] is?”                      |
| GY-07 | Ask someone whether they’ve tried one of the gym’s classes.      | “Hey, have you tried the [class] here?”                           |
| GY-08 | Ask someone at the front desk when the gym is least busy.        | “When’s usually the quietest time to come in?”                    |
| GY-09 | Introduce yourself to someone you recognize between sets.        | “Hey, how’s your workout going? I see you here a lot—I’m [name].” |
| GY-10 | Ask someone nearby how their workout is going.                   | Catch them between exercises: “Good workout so far?”              |
| GY-11 | Ask someone if you can take turns using their machine.           | Between sets: “Hey, would you mind if I worked in with you?”      |

## Cafe — 10 cards

Situations: ordering, waiting in line, waiting for a drink, approaching a table, sitting nearby, and leaving.

| Card  | Challenge text                                                                  | Subtext                                                           |
| ----- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| CF-01 | Smile and ask the barista how it’s going.                                       | Before ordering: “Hey, how are you?”                              |
| CF-02 | Ask the barista to recommend a drink.                                           | “What would you recommend if I like [flavor or drink]?”           |
| CF-03 | Ask someone in line what they’re going to order.                                | “What are you thinking of getting?”                               |
| CF-04 | Ask someone at the pickup counter what drink they got.                          | “That looks good—what did you order?”                             |
| CF-05 | Ask someone sitting beside you to watch your things while you use the bathroom. | “Would you mind keeping an eye on my things for a minute?”        |
| CF-06 | Give someone a genuine compliment as you’re leaving.                            | “Just wanted to say, I really like your [item]. Have a good one!” |
| CF-07 | Ask someone sitting nearby what they’re working on.                             | When they take a break: “Hey, what are you working on?”           |
| CF-08 | Ask someone in line whether they’ve tried an item on the menu.                  | “Have you tried the [item]? I’m thinking of getting it.”          |
| CF-09 | Ask the barista which pastry they’d pick.                                       | “Which of these would you go for?”                                |
| CF-10 | Ask someone sitting beside you if they know the Wi-Fi password.                 | “Hey, do you happen to know the Wi-Fi password?”                  |

For CF-03, “What do you usually get?” is an alternative opener on the same card, not an additional card.

## Bookstore — 10 cards

Situations: approaching staff, browsing beside someone, and approaching someone in an unfamiliar genre with a genuine question.

| Card  | Challenge text                                                         | Subtext                                                       |
| ----- | ---------------------------------------------------------------------- | ------------------------------------------------------------- |
| BK-01 | Smile and ask a staff member how their day is going.                   | “Hey, how’s your day going?”                                  |
| BK-02 | Ask someone for a book recommendation.                                 | “Have you read anything good lately?”                         |
| BK-03 | Ask a staff member to help you find a book.                            | “Hi, could you help me find [book]?”                          |
| BK-04 | Ask a staff member what they’re currently reading.                     | “What are you reading at the moment?”                         |
| BK-05 | Ask someone beside you whether they’ve read a book you’re considering. | Hold it up: “Have you read this one?”                         |
| BK-06 | Ask someone nearby to help you choose between two books.               | “I’m deciding between these—have you read either?”            |
| BK-07 | Ask someone browsing an unfamiliar genre where you should start.       | “I don’t usually read [genre]. Is there one you’d recommend?” |
| BK-08 | Ask a staff member to help you find a section you want to explore.     | “Hi, where would I find the [genre] section?”                 |
| BK-09 | Ask someone reading nearby what book they’re reading.                  | “Hey, what are you reading?”                                  |
| BK-10 | Ask someone browsing beside you what kind of books they enjoy.         | “What kind of books are you into?”                            |

## Bars & Clubs — 10 cards

Situations: the entrance line, waiting at the bar, nearby tables, and the dance floor.

| Card  | Challenge text                                                                   | Subtext                                           |
| ----- | -------------------------------------------------------------------------------- | ------------------------------------------------- |
| BC-01 | Introduce yourself to someone nearby.                                            | “Hey, I’m [name]. What’s your name?”              |
| BC-02 | Ask someone nearby what drink they ordered.                                      | “That looks good—what are you drinking?”          |
| BC-03 | Ask the bartender to recommend a drink.                                          | “What would you recommend?”                       |
| BC-04 | Give someone nearby a genuine compliment.                                        | “I really like your [item]—where did you get it?” |
| BC-05 | Ask someone in the entrance line whether it’s been moving.                       | “Hey, has the line been moving pretty quickly?”   |
| BC-06 | Ask someone near you on the dance floor if they know the song.                   | “Do you know what this song’s called?”            |
| BC-07 | Raise your drink and say cheers to someone nearby.                               | Smile, raise your glass, and say “Cheers!”        |
| BC-08 | Ask someone nearby if they’re celebrating anything tonight.                      | “Are you out for anything special tonight?”       |
| BC-09 | Ask someone near the bar what drink they’re going to order.                      | “What are you thinking of getting?”               |
| BC-10 | Make a friendly comment about the song to someone beside you on the dance floor. | Smile and say, “This is a good one!”              |

## Cross-venue overlap index

These groups make overlapping actions easy to review. Some wording and situations differ by venue; this index does not silently replace those differences with one canonical text or prescribe database IDs. The card labels above are document references. Every venue placement retains independent ordering even when its content is shared.

| Shared action                                 | Venue cards                                                        |
| --------------------------------------------- | ------------------------------------------------------------------ |
| Greet someone passing                         | ST-01, PK-01                                                       |
| Comment on the weather                        | ST-05, PK-02                                                       |
| Compliment a dog                              | ST-06, PK-03                                                       |
| Ask where someone got an item                 | ST-09, PK-05; BC-04 also includes this question after a compliment |
| Ask for a nearby coffee recommendation        | ST-04, PK-07                                                       |
| Compliment someone's clothing or an item      | ST-02, ST-10, PK-08, CF-06, BC-04                                  |
| Ask how someone's day is going                | PK-06, GY-01, CF-01, BK-01                                         |
| Ask a staff member for a drink recommendation | CF-02, BC-03                                                       |
| Ask what someone is going to order            | CF-03, BC-09                                                       |
| Ask what drink someone already ordered        | CF-04, BC-02                                                       |
| Introduce yourself                            | GY-09, BC-01                                                       |
