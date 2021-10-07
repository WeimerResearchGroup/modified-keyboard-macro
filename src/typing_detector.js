'use strict';
const vscode = require('vscode');
const { CursorMotionDetector } = require('./cursor_motion_detector.js');

const TypingDetector = function() {
    let onDetectTypingCallback  = null;
    let recording = false;
    let suspending = false;
    let targetTextEditor = null;
    const cursorMotionDetector = CursorMotionDetector();

    const onDetectTyping = function(callback) {
        onDetectTypingCallback = callback;
    };
    const notifyDetectedTyping = function(text) {
        if (onDetectTypingCallback) {
            onDetectTypingCallback({
                command: 'default:type',
                args: {
                    text: text
                }
            });
        }
    };

    const start = function(textEditor) {
        recording = true;
        suspending = false;
        targetTextEditor = textEditor;
        cursorMotionDetector.start(textEditor);
    };
    const stop = function() {
        recording = false;
        suspending = false;
        targetTextEditor = null;
        cursorMotionDetector.stop();
    };
    const suspend = function() {
        suspending = true;
        cursorMotionDetector.stop();
    };
    const resume = function(textEditor) {
        suspending = false;
        cursorMotionDetector.start(textEditor);
    };

    const predictSelection = function(changes) {
        let sels = [], lineOffset = 0;
        for (let i = 0; i < changes.length; i++) {
            let chg = changes[i];
            let pos = chg.range.start.translate({
                lineDelta: lineOffset,
                characterDelta: chg.text.length
            });
            // lineOffset += Array.from(chg.text).filter(c => c === '\n').length;
            lineOffset -= chg.range.end.line - chg.range.start.line;
            sels[i] = new vscode.Selection(pos, pos);
        }
        return sels;
    };

    const processDocumentChangeEvent = function(event) {
        if (!recording || suspending) {
            return;
        }
        if (event.document !== targetTextEditor.document) {
            return;
        }
        if (event.contentChanges.length === 0) {
            return;
        }

        const changes = Array.from(event.contentChanges);
        changes.sort((a, b) => a.rangeOffset - b.rangeOffset);
        const selections = Array.from(cursorMotionDetector.getExpectedSelections() || targetTextEditor.selections);
        selections.sort((a, b) => a.start.compareTo(b.start));

        const text0 = changes[0].text;
        const isUniformText = changes.every((chg) => chg.text === text0);
        if (changes.length === selections.length && isUniformText && text0 !== '') {
            const rangesOfChangeEqualSelections = changes.every((chg, i) => selections[i].isEqual(chg.range));
            if (rangesOfChangeEqualSelections) {
                // Pure insertion of a single line of text or,
                // replacing (possibly multiple) selected range(s) with a text
                const expectedSelections = predictSelection(changes);
                cursorMotionDetector.setExpectedSelections(expectedSelections);
                notifyDetectedTyping(text0);
            }
        }
    };

    return {
        onDetectTyping,
        onDetectCursorMotion: cursorMotionDetector.onDetectCursorMotion,
        start,
        stop,
        suspend,
        resume,
        processDocumentChangeEvent,
        processSelectionChangeEvent : cursorMotionDetector.processSelectionChangeEvent,
        getExpectedSelections: cursorMotionDetector.getExpectedSelections // testing purpose only
    };
};

module.exports = { TypingDetector };