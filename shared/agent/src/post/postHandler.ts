"use strict";

import * as path from "path";
import { Range } from "vscode-languageserver-protocol";
import URI from "vscode-uri";
import {
	DocumentPostRequestParams,
	DocumentPreparePostRequestParams,
	DocumentPreparePostResponse
} from "../agent";
import { CreatePostRequestCodeBlock, CSMarkerLocation, CSPost } from "../api/api";
import { Container } from "../container";
import { Logger } from "../logger";
import { MarkerLocationUtil } from "../markerLocation/markerLocationUtil";
import { Iterables, Strings } from "../system";

export namespace PostHandler {
	let lastFullCode = "";

	export async function documentPreparePost({
		textDocument: documentId,
		range,
		dirty
	}: DocumentPreparePostRequestParams): Promise<DocumentPreparePostResponse> {
		const { documents, git, session } = Container.instance();

		const document = documents.get(documentId.uri);
		if (document === undefined) {
			throw new Error(`No document could be found for Uri(${documentId.uri})`);
		}
		lastFullCode = document.getText();

		const uri = URI.parse(document.uri);
		const repoPath = await git.getRepoRoot(uri.fsPath);

		let authors: { id: string; username: string }[] | undefined;
		let file: string | undefined;
		let remotes: { name: string; url: string }[] | undefined;
		let rev: string | undefined;
		if (repoPath !== undefined) {
			try {
				file = Strings.normalizePath(path.relative(repoPath, uri.fsPath));
				if (file[0] === "/") {
					file = file.substr(1);
				}

				rev = await git.getFileCurrentRevision(uri.fsPath);
				const gitRemotes = await git.getRepoRemotes(repoPath);
				remotes = [...Iterables.map(gitRemotes, r => ({ name: r.name, url: r.normalizedUrl }))];

				const gitAuthors = await git.getFileAuthors(uri.fsPath, {
					startLine: range.start.line,
					endLine: range.end.line - 1,
					contents: dirty ? lastFullCode : undefined
				});
				const authorEmails = gitAuthors.map(a => a.email);

				const users = await session.users.getByEmails(authorEmails);
				authors = [...Iterables.map(users, u => ({ id: u.id, username: u.name }))];
			} catch (ex) {
				Logger.error(ex);
				debugger;
			}
		}

		return {
			code: document.getText(range),
			source:
				repoPath !== undefined
					? {
							file: file!,
							repoPath: repoPath,
							revision: rev!,
							authors: authors || [],
							remotes: remotes || []
					  }
					: undefined
		};
	}

	export async function documentPost({
		textDocument: documentId,
		location: rangeArray,
		text,
		code,
		source,
		streamId,
		parentPostId,
		mentionedUserIds
	}: DocumentPostRequestParams): Promise<CSPost | undefined> {
		const { api, state, git, documents } = Container.instance();

		const document = documents.get(documentId.uri);
		if (!document) {
			throw new Error(`Could not retrieve document ${documentId.uri} from document manager`);
		}

		const filePath = URI.parse(documentId.uri).fsPath;
		const fileContents = document.getText();

		let codeBlock: CreatePostRequestCodeBlock | undefined;
		let commitHashWhenPosted: string | undefined;
		let location: CSMarkerLocation | undefined;
		let backtrackedLocation: CSMarkerLocation | undefined;
		if (rangeArray) {
			const range = Range.create(rangeArray[0], rangeArray[1], rangeArray[2], rangeArray[3]);
			location = MarkerLocationUtil.rangeToLocation(range);

			if (source) {
				if (source.revision) {
					commitHashWhenPosted = source.revision;
					backtrackedLocation = await MarkerLocationUtil.backtrackLocation(
						documentId,
						lastFullCode,
						location
					);
				} else {
					commitHashWhenPosted = (await git.getRepoHeadRevision(source.repoPath))!;
					backtrackedLocation = MarkerLocationUtil.emptyFileLocation();
				}
			}

			codeBlock = {
				code,
				file: source && source.file,
				remotes: source && source.remotes.map(r => r.url),
				location: backtrackedLocation && MarkerLocationUtil.locationToArray(backtrackedLocation)
			};
		}

		try {
			const post = (await api.createPost(state.apiToken, {
				teamId: state.teamId,
				streamId,
				text,
				parentPostId,
				codeBlocks: codeBlock && [codeBlock],
				commitHashWhenPosted,
				mentionedUserIds
			})).post;

			if (post.codeBlocks) {
				const meta = backtrackedLocation!.meta;
				if (meta && (meta.startWasDeleted || meta.endWasDeleted)) {
					const uncommittedLocation = {
						id: post.codeBlocks[0].markerId,
						...location!
					};

					await MarkerLocationUtil.saveUncommittedLocation(
						filePath,
						fileContents,
						uncommittedLocation
					);
				}
			}

			return post;
		} catch (ex) {
			debugger;
			return;
		}
	}

	function preRange(range: Range): Range {
		const { start } = range;
		const preStart = {
			line: Math.max(start.line - 3, 0),
			character: 0
		};
		const preEnd = {
			line: start.line,
			character: start.character
		};
		const preRange = {
			start: preStart,
			end: preEnd
		};
		return preRange;
	}

	function postRange(range: Range) {
		const { end } = range;
		const postStart = {
			line: end.line + 4,
			character: end.character
		};
		const postEnd = {
			line: end.line + 4,
			character: 0
		};
		const postRange = {
			start: postStart,
			end: postEnd
		};
		return postRange;
	}
}
