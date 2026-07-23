import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
    isSlashMode,
    getSlashFilter,
    filterCommands,
    clampIndex,
    getVisibleWindow,
    getCompletionString,
} from "./CommandDropdown.tsx";
import type { Command } from "../../commands/types.ts";

const mockCommands: Command[] = [
    {
        name: "help",
        aliases: ["h", "?"],
        description: "Show help",
        execute: async () => {},
    },
    {
        name: "config",
        aliases: ["cfg"],
        description: "Configure settings",
        execute: async () => {},
    },
    {
        name: "runtime",
        aliases: ["rt"],
        description: "Switch runtime",
        execute: async () => {},
    },
    {
        name: "exit",
        aliases: ["quit", "q"],
        description: "Exit the app",
        execute: async () => {},
    },
];

describe("CommandDropdown: isSlashMode", () => {
    it("returns true for / alone", () => {
        assert.equal(isSlashMode("/"), true);
    });

    it("returns true for /he (partial command)", () => {
        assert.equal(isSlashMode("/he"), true);
    });

    it("returns true for /help (full command, no space)", () => {
        assert.equal(isSlashMode("/help"), true);
    });

    it("returns false for /help  (with trailing space)", () => {
        assert.equal(isSlashMode("/help "), false);
    });

    it("returns false for /config key value (has args)", () => {
        assert.equal(isSlashMode("/config key value"), false);
    });

    it("returns false for plain text", () => {
        assert.equal(isSlashMode("hello world"), false);
    });

    it("returns false for empty string", () => {
        assert.equal(isSlashMode(""), false);
    });

    it("returns false when slash is not at start", () => {
        assert.equal(isSlashMode("hello /cmd"), false);
    });
});

describe("CommandDropdown: getSlashFilter", () => {
    it("returns empty for / alone", () => {
        assert.equal(getSlashFilter("/"), "");
    });

    it("returns lowercase filter for /HeLp", () => {
        assert.equal(getSlashFilter("/HeLp"), "help");
    });

    it("returns filter for /con", () => {
        assert.equal(getSlashFilter("/con"), "con");
    });

    it("returns empty when not in slash mode", () => {
        assert.equal(getSlashFilter("/help "), "");
        assert.equal(getSlashFilter("hello"), "");
    });
});

describe("CommandDropdown: filterCommands", () => {
    it("returns all commands for empty filter", () => {
        const result = filterCommands(mockCommands, "");
        assert.equal(result.length, mockCommands.length);
    });

    it("filters by command name prefix", () => {
        const result = filterCommands(mockCommands, "he");
        assert.equal(result.length, 1);
        assert.equal(result[0].name, "help");
    });

    it("filters by alias prefix", () => {
        const result = filterCommands(mockCommands, "rt");
        assert.equal(result.length, 1);
        assert.equal(result[0].name, "runtime");
    });

    it("filters by multiple-char alias", () => {
        const result = filterCommands(mockCommands, "cfg");
        assert.equal(result.length, 1);
        assert.equal(result[0].name, "config");
    });

    it("returns multiple matches", () => {
        const commands: Command[] = [
            { name: "config", description: "a", execute: async () => {} },
            { name: "connect", description: "b", execute: async () => {} },
        ];
        const result = filterCommands(commands, "con");
        assert.equal(result.length, 2);
    });

    it("returns empty array for no matches", () => {
        const result = filterCommands(mockCommands, "xyz");
        assert.equal(result.length, 0);
    });

    it("is case insensitive", () => {
        const result = filterCommands(mockCommands, "HELP");
        assert.equal(result.length, 1);
        assert.equal(result[0].name, "help");
    });
});

describe("CommandDropdown: clampIndex", () => {
    it("returns 0 for empty list", () => {
        assert.equal(clampIndex(5, 0), 0);
    });

    it("clamps to max index", () => {
        assert.equal(clampIndex(10, 4), 3);
    });

    it("clamps negative to 0", () => {
        assert.equal(clampIndex(-1, 4), 0);
    });

    it("returns same index when in range", () => {
        assert.equal(clampIndex(2, 4), 2);
    });
});

describe("CommandDropdown: getVisibleWindow", () => {
    it("returns full range when count <= maxVisible", () => {
        const { startIndex, endIndex } = getVisibleWindow(2, 5, 8);
        assert.equal(startIndex, 0);
        assert.equal(endIndex, 5);
    });

    it("centers selection in window", () => {
        const { startIndex, endIndex } = getVisibleWindow(5, 15, 8);
        assert.equal(startIndex, 1);
        assert.equal(endIndex, 9);
    });

    it("clamps to start when selection near beginning", () => {
        const { startIndex, endIndex } = getVisibleWindow(1, 15, 8);
        assert.equal(startIndex, 0);
        assert.equal(endIndex, 8);
    });

    it("clamps to end when selection near end", () => {
        const { startIndex, endIndex } = getVisibleWindow(14, 15, 8);
        assert.equal(startIndex, 7);
        assert.equal(endIndex, 15);
    });
});

describe("CommandDropdown: getCompletionString", () => {
    it("returns /{name} with trailing space", () => {
        const cmd = mockCommands[0];
        assert.equal(getCompletionString(cmd), "/help ");
    });

    it("works for different commands", () => {
        assert.equal(getCompletionString(mockCommands[1]), "/config ");
        assert.equal(getCompletionString(mockCommands[2]), "/runtime ");
    });
});
