// Only the exception/attachment boundaries are represented; this is not an iOS build.
// Cocoa 9.29.0 SentryException.h declares type/value nullable (Swift String?).
// Its Hint.attachments list is authoritative after beforeSendWithHint returns.
// https://github.com/getsentry/sentry-cocoa/blob/9.29.0/Sources/Sentry/Public/SentryException.h
// https://github.com/getsentry/sentry-cocoa/blob/9.29.0/Sources/Swift/Protocol/SentryHint.swift
final class Exception {
  var value: String?
  var type: String?
  var threadId: Int?
  var stacktrace: String?
  var mechanism: Mechanism?

  init(value: String?, type: String?) {
    self.value = value
    self.type = type
  }
}

final class Mechanism {
  let type: String
  var handled: Bool?
  init(type: String) { self.type = type }
}

final class Event {
  var exceptions: [Exception]?
}

// Stack handling has its own generated-source checks; it is outside this fixture.
func stack(_ original: String?) -> String? { nil }

func scrubExceptions(_ exceptions: [Exception]) -> [Exception]? {
  // GENERATED_DUPLICATE_FILTER
  let clean = Event()
  // GENERATED_EXCEPTION_MAPPING
  return clean.exceptions
}

let known = Exception(value: "private reason", type: "EXC_BAD_ACCESS")
known.threadId = 42
let unknown = Exception(value: "private journal", type: "private type")
let missingType = Exception(value: "private reason", type: nil)
let missingValue = Exception(value: nil, type: "EXC_CRASH")
let result = scrubExceptions([known, unknown, missingType, missingValue])!
precondition(result.count == 4)
precondition(result[0].type == "EXC_BAD_ACCESS")
precondition(result[1].type == "NativeError")
precondition(result[2].type == "NativeError")
precondition(result[3].type == "EXC_CRASH")
precondition(result.allSatisfy { $0.value == "Native application failure" })
precondition(result.allSatisfy { $0.mechanism?.handled == false })
precondition(result[0].threadId == 42)
precondition(known.value == "private reason")
precondition(unknown.type == "private type")
precondition(scrubExceptions(Array(repeating: known, count: 11))!.count == 10)
precondition(scrubExceptions([
  Exception(value: nil, type: "Unhandled JS Exception: private")
]) == nil)
precondition(scrubExceptions([
  Exception(value: "ExceptionsManager.reportException: private", type: nil)
]) == nil)
final class Hint {
  var attachments: [String] = []
}

final class Options {
  var beforeSendWithHint: ((Event, Hint) -> Event?)?
}

// Full event reconstruction has generated-source checks outside this fixture.
func scrub(_ event: Event) -> Event? { event }

func sendCallback(_ reportingEnabled: Bool) -> (Event, Hint) -> Event? {
  let options = Options()
  // GENERATED_SEND_CALLBACK
  return options.beforeSendWithHint!
}

for enabled in [true, false] {
  let hint = Hint()
  hint.attachments = ["", "private current-run file", "private cached-crash file"]
  let event = Event()
  let clean = sendCallback(enabled)(event, hint)
  precondition(hint.attachments.isEmpty)
  precondition(enabled ? clean === event : clean == nil)
}
print("Native privacy contracts passed")
