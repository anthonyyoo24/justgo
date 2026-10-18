// Only the exception boundary is represented here; this is not an iOS build.
// Cocoa 8.58.0 SentryException.h declares type/value nonnull under
// NS_ASSUME_NONNULL_BEGIN, so their imported Swift contract is String:
// https://github.com/getsentry/sentry-cocoa/blob/8.58.0/Sources/Sentry/Public/SentryException.h
final class Exception {
  var value: String
  var type: String
  var threadId: Int?
  var stacktrace: String?
  var mechanism: Mechanism?

  init(value: String, type: String) {
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
let result = scrubExceptions([known, unknown])!
precondition(result.count == 2)
precondition(result[0].type == "EXC_BAD_ACCESS")
precondition(result[1].type == "NativeError")
precondition(result.allSatisfy { $0.value == "Native application failure" })
precondition(result.allSatisfy { $0.mechanism?.handled == false })
precondition(result[0].threadId == 42)
precondition(known.value == "private reason")
precondition(unknown.type == "private type")
precondition(scrubExceptions(Array(repeating: known, count: 11))!.count == 10)
precondition(scrubExceptions([
  Exception(value: "ignored", type: "Unhandled JS Exception: private")
]) == nil)
precondition(scrubExceptions([
  Exception(value: "ExceptionsManager.reportException: private", type: "Error")
]) == nil)
print("Native exception contract passed")
