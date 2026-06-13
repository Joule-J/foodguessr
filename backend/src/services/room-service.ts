import { randomUUID } from "node:crypto";

import type { SessionRecord } from "../domain";

type RoomSlot = "PLAYER_1" | "PLAYER_2";
export type RoomStatus = "WAITING_FOR_PLAYER" | "IN_PROGRESS" | "COMPLETED";

type RoomMember = {
  id: string;
  name: string;
  slot: RoomSlot;
  joinedAt: Date;
};

type RoomMessage = {
  id: string;
  memberId: string;
  senderName: string;
  senderSlot: RoomSlot;
  text: string;
  replyToMessageId?: string;
  reactions: Array<{
    memberId: string;
    emoji: string;
  }>;
  createdAt: Date;
};

type RoomRecord = {
  id: string;
  code: string;
  sessionId: string;
  status: RoomStatus;
  createdAt: Date;
  members: RoomMember[];
  messages: RoomMessage[];
};

function generateRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join(
    ""
  );
}

export class RoomService {
  private rooms = new Map<string, RoomRecord>();

  createRoom(session: SessionRecord, hostName: string) {
    let code = generateRoomCode();

    while (this.rooms.has(code)) {
      code = generateRoomCode();
    }

    const hostMember: RoomMember = {
      id: randomUUID(),
      name: hostName,
      slot: "PLAYER_1",
      joinedAt: new Date()
    };

    const room: RoomRecord = {
      id: randomUUID(),
      code,
      sessionId: session.id,
      status: "WAITING_FOR_PLAYER",
      createdAt: new Date(),
      members: [hostMember],
      messages: []
    };

    this.rooms.set(code, room);
    return {
      room,
      selfMember: hostMember
    };
  }

  findRoom(code: string) {
    return this.rooms.get(code.toUpperCase()) ?? null;
  }

  joinRoom(code: string, guestName: string) {
    const room = this.findRoom(code);

    if (!room) {
      return null;
    }

    if (room.status === "COMPLETED") {
      throw new Error("Room is already complete.");
    }

    if (room.members.length >= 2) {
      throw new Error("Room is full.");
    }

    const guestMember: RoomMember = {
      id: randomUUID(),
      name: guestName,
      slot: "PLAYER_2",
      joinedAt: new Date()
    };

    room.members.push(guestMember);
    room.status = "IN_PROGRESS";

    return {
      room,
      selfMember: guestMember
    };
  }

  getMember(code: string, memberId: string) {
    const room = this.findRoom(code);

    if (!room) {
      return null;
    }

    return room.members.find((member) => member.id === memberId) ?? null;
  }

  addMessage(code: string, memberId: string, text: string, replyToMessageId?: string) {
    const room = this.findRoom(code);

    if (!room) {
      return null;
    }

    const member = room.members.find((item) => item.id === memberId);

    if (!member) {
      return null;
    }

    const replyTarget = replyToMessageId
      ? room.messages.find((message) => message.id === replyToMessageId)
      : null;

    if (replyToMessageId && !replyTarget) {
      throw new Error("Reply target not found.");
    }

    const message: RoomMessage = {
      id: randomUUID(),
      memberId,
      senderName: member.name,
      senderSlot: member.slot,
      text,
      replyToMessageId,
      reactions: [],
      createdAt: new Date()
    };

    room.messages.push(message);
    return message;
  }

  addReaction(code: string, memberId: string, messageId: string, emoji: string) {
    const room = this.findRoom(code);

    if (!room) {
      return null;
    }

    const member = room.members.find((item) => item.id === memberId);

    if (!member) {
      return null;
    }

    const message = room.messages.find((item) => item.id === messageId);

    if (!message) {
      throw new Error("Message not found.");
    }

    const existingReactionIndex = message.reactions.findIndex(
      (reaction) => reaction.memberId === memberId && reaction.emoji === emoji
    );

    if (existingReactionIndex >= 0) {
      message.reactions.splice(existingReactionIndex, 1);
      return message;
    }

    message.reactions = message.reactions.filter((reaction) => reaction.memberId !== memberId);
    message.reactions.push({
      memberId,
      emoji
    });

    return message;
  }

  restartRoom(code: string, session: SessionRecord) {
    const room = this.findRoom(code);

    if (!room) {
      return null;
    }

    room.sessionId = session.id;
    room.status = room.members.length >= 2 ? "IN_PROGRESS" : "WAITING_FOR_PLAYER";
    return room;
  }

  syncRoomStatus(code: string, sessionStatus: SessionRecord["status"]) {
    const room = this.findRoom(code);

    if (!room) {
      return null;
    }

    if (sessionStatus === "COMPLETED") {
      room.status = "COMPLETED";
      return room;
    }

    room.status = room.members.length >= 2 ? "IN_PROGRESS" : "WAITING_FOR_PLAYER";
    return room;
  }

  toClientPayload(room: RoomRecord, selfMemberId: string) {
    const selfMember = room.members.find((member) => member.id === selfMemberId);

    if (!selfMember) {
      throw new Error("Room member is missing.");
    }

    return {
      roomCode: room.code,
      roomStatus: room.status,
      selfMemberId: selfMember.id,
      selfSlot: selfMember.slot,
      selfName: selfMember.name,
      members: room.members.map((member) => ({
        id: member.id,
        name: member.name,
        slot: member.slot
      })),
      messages: room.messages.map((message) => ({
        id: message.id,
        memberId: message.memberId,
        senderName: message.senderName,
        senderSlot: message.senderSlot,
        text: message.text,
        replyTo: message.replyToMessageId
          ? (() => {
              const replyTarget = room.messages.find((item) => item.id === message.replyToMessageId);

              if (!replyTarget) {
                return null;
              }

              return {
                id: replyTarget.id,
                senderName: replyTarget.senderName,
                text: replyTarget.text
              };
            })()
          : null,
        reactions: message.reactions.map((reaction) => ({
          memberId: reaction.memberId,
          emoji: reaction.emoji
        })),
        createdAt: message.createdAt.toISOString()
      }))
    };
  }
}
