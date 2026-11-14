import CoreGraphics
import Foundation

// kiwi-input click <x> <y>     global screen points, top-left origin
// kiwi-input type <text>
// kiwi-input paste             Command-V into whatever has focus
let arguments = CommandLine.arguments
guard arguments.count >= 3 else {
  if CommandLine.arguments.count == 2 && CommandLine.arguments[1] == "paste" {
    let source = CGEventSource(stateID: .hidSystemState)
    for down in [true, false] {
      let key = CGEvent(keyboardEventSource: source, virtualKey: 9, keyDown: down)
      key?.flags = .maskCommand
      key?.post(tap: .cghidEventTap)
      usleep(30_000)
    }
    exit(0)
  }
  FileHandle.standardError.write("usage: kiwi-input click x y | type text | paste\n".data(using: .utf8)!)
  exit(2)
}

let source = CGEventSource(stateID: .hidSystemState)

func post(_ event: CGEvent?) {
  event?.post(tap: .cghidEventTap)
}

switch arguments[1] {
case "click":
  guard arguments.count == 4, let x = Double(arguments[2]), let y = Double(arguments[3]) else { exit(2) }
  let point = CGPoint(x: x, y: y)
  post(CGEvent(mouseEventSource: source, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: .left))
  usleep(60_000)
  post(CGEvent(mouseEventSource: source, mouseType: .leftMouseDown, mouseCursorPosition: point, mouseButton: .left))
  usleep(40_000)
  post(CGEvent(mouseEventSource: source, mouseType: .leftMouseUp, mouseCursorPosition: point, mouseButton: .left))
case "type":
  let selectAll = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: true)
  selectAll?.flags = .maskCommand
  post(selectAll)
  let selectAllUp = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: false)
  selectAllUp?.flags = .maskCommand
  post(selectAllUp)
  usleep(40_000)
  let text = arguments[2...].joined(separator: " ")
  for character in text.utf16 {
    var unit = character
    let down = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: true)
    down?.keyboardSetUnicodeString(stringLength: 1, unicodeString: &unit)
    post(down)
    let up = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: false)
    up?.keyboardSetUnicodeString(stringLength: 1, unicodeString: &unit)
    post(up)
    usleep(12_000)
  }
default:
  exit(2)
}
