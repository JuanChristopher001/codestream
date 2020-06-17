import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import CancelButton from "./CancelButton";
import { CodeStreamState } from "../store";
import { HostApi } from "../webview-api";
import Icon from "./Icon";
import { Checkbox } from "../src/components/Checkbox";
import styled from "styled-components";
import { Button } from "../src/components/Button";
import { setUserStatus } from "./actions";
import { closePanel } from "../store/context/actions";
import { CSMe } from "@codestream/protocols/api";
import { emojiPlain } from "./Markdowner";
import { InlineMenu } from "../src/components/controls/InlineMenu";
import EmojiPicker from "./EmojiPicker";
import { useDidMount } from "../utilities/hooks";
import {
	GetBranchesRequestType,
	CreateBranchRequestType,
	SwitchBranchRequestType
} from "@codestream/protocols/agent";
import Menu from "./Menu";
import { CrossPostIssueContext } from "./CodemarkForm";
import IssueDropdown from "./CrossPostIssueControls/IssueDropdown";
import { CSText } from "../src/components/CSText";
import { ConfigureBranchNames } from "./ConfigureBranchNames";
import { VideoLink } from "./Flow";
const emojiData = require("../node_modules/markdown-it-emoji-mart/lib/data/full.json");

const StyledCheckbox = styled(Checkbox)`
	color: var(--text-color-subtle);
`;

const StatusInput = styled.div`
	position: relative;
	margin-bottom: 20px;
	.icon-selector,
	.dropdown-button {
		position: absolute;
		left: 1px;
		top: 1px;
		border-right: 1px solid var(--base-border-color);
		font-size: 18px;
		line-height: 20px;
		display: flex;
		width: 34px;
		height: calc(100% - 2px);
		align-items: center;
		justify-content: center;
		cursor: pointer;
		&:hover {
			background: var(--app-background-color);
			color: var(--text-color-highlight);
		}
		&.selected {
			background: var(--button-background-color);
			color: var(--button-foreground-color);
		}
		.octicon-git-branch {
			margin: 2px 2px -2px -2px;
		}
		.selected-emoji {
			display: inline-block;
			padding-left: 4px;
		}
	}
	.clear {
		position: absolute;
		right: 2px;
		top: 1px;
		padding: 8px 10px;
	}
	.dropdown-button {
		left: auto;
		right: 1px;
		align-items: center;
		justify-content: center;
		border-left: 1px solid var(--base-border-color);
		border-right: none;
		.icon {
			margin: 4px 0 0 -2px;
			&.spin {
				margin: -2px 0 0 -1px;
			}
		}
	}
	input#status-input {
		border: 1px solid var(--base-border-color);
		font-size: 14px !important;
		padding: 8px 40px 8px 42px !important;
		&::placeholder {
			font-size: 14px !important;
		}
	}
`;

const ButtonRow = styled.div`
	text-align: center;
	margin-top: 20px;
	button {
		width: 18em;
	}
`;

const Examples = styled.div`
	padding: 5px 0 20px 0;
	div {
		cursor: pointer;
		padding: 3px 8px;
		font-weight: bold;
		.time {
			font-weight: normal;
			opacity: 0.5;
		}
		.icon {
			display: inline-block;
			width: 20px;
		}
		.emoji {
			vertical-align: -2px;
			padding-right: 3px;
			font-size: 20px;
		}
		&:hover {
			background: var(--base-background-color);
			color: var(--text-color-highlight);
		}
	}
`;

const MonoMenu = styled(InlineMenu)`
	font-family: Menlo, Consolas, "DejaVu Sans Mono", monospace;
	white-space: normal;
`;

const SCMError = styled.div`
	margin: 20px 0 0 0;
	font-size: smaller;
	font-family: Menlo, Consolas, "DejaVu Sans Mono", monospace;
	white-space: pre-wrap;
`;

const EMPTY_STATUS = {
	label: "",
	icon: ":desktop_computer:",
	expires: 0
};

export const StatusPanel = (props: { closePanel: Function }) => {
	const dispatch = useDispatch();
	const derivedState = useSelector((state: CodeStreamState) => {
		const currentUser = state.users[state.session.userId!] as CSMe;
		let status =
			currentUser.status && "label" in currentUser.status ? currentUser.status : EMPTY_STATUS;
		const now = new Date().getTime();
		if (status.expires && status.expires < now) status = EMPTY_STATUS;
		const teamId = state.context.currentTeamId;
		const team = state.teams[teamId];
		const settings = team.settings || {};

		return {
			status,
			teamName: team.name,
			currentUserName: state.users[state.session.userId!].username,
			textEditorUri: state.editorContext.textEditorUri,
			branchMaxLength: settings.branchMaxLength || 40,
			branchTicketTemplate: settings.branchTicketTemplate || "feature/ticket-{id}",
			branchDescriptionTemplate: settings.branchDescriptionTemplate || "feature/{description}"
		};
	});

	const { status } = derivedState;
	const [loading, setLoading] = useState(false);
	const [scmError, setScmError] = useState("");
	const [label, setLabel] = useState(status.label || "");
	const [icon, setIcon] = useState(status.icon || ":desktop_computer:");
	const [emojiMenuOpen, setEmojiMenuOpen] = useState(false);
	const [emojiMenuTarget, setEmojiMenuTarget] = useState(null as any);
	const [moveIssue, setMoveIssue] = useState(true);
	const [createBranch, setCreateBranch] = useState(true);
	const [branch, setBranch] = useState("");
	const [newBranch, setNewBranch] = useState("");
	const [currentBranch, setCurrentBranch] = useState("");
	const [editingBranch, setEditingBranch] = useState(false);
	const [branches, setBranches] = useState([] as string[]);
	const [branchTouched, setBranchTouched] = useState(false);
	const [configureBranchNames, setConfigureBranchNames] = useState(false);

	const setTheLabel = (value: string, newBranch?: string) => {
		setLabel(value || "");

		if (newBranch) {
			setNewBranch(newBranch);
			if (!branchTouched) setBranch(newBranch);
		}
	};

	const dateToken = () => {
		const now = new Date();
		const year = now.getFullYear();
		const month = now.getMonth() + 1;
		const date = now.getDate();
		return `${year}-${month > 9 ? month : "0" + month}-${date > 9 ? date : "0" + date}`;
	};

	const replaceDescriptionTokens = (template: string, description: string = "") => {
		return template
			.replace(/\{id\}/g, "")
			.replace(/\{username\}/g, derivedState.currentUserName)
			.replace(/\{team\}/g, derivedState.teamName)
			.replace(/\{date\}/g, dateToken())
			.replace(/\{description\}/g, description.toLowerCase())
			.replace(/[\s]+/g, "-")
			.substr(0, derivedState.branchMaxLength);
	};

	const replaceTicketTokens = (template: string, id: string, description: string = "") => {
		return template
			.replace(/\{id\}/g, id)
			.replace(/\{username\}/g, derivedState.currentUserName)
			.replace(/\{team\}/g, derivedState.teamName)
			.replace(/\{date\}/g, dateToken())
			.replace(/\{description\}/g, description.toLowerCase())
			.replace(/[\s]+/g, "-")
			.substr(0, derivedState.branchMaxLength);
	};

	const makeBranchName = (value: string) =>
		replaceDescriptionTokens(derivedState.branchDescriptionTemplate, value);

	const getBranches = async () => {
		if (!derivedState.textEditorUri) return;
		const branchInfo = await HostApi.instance.send(GetBranchesRequestType, {
			uri: derivedState.textEditorUri
		});
		if (!branchInfo.scm) return;
		// return {
		// 	branches: branchInfo.scm.branches,
		// 	current: branchInfo.scm.current,
		// 	menuItems: branchMenuItems
		// }
		setBranches(branchInfo.scm.branches);
		setCurrentBranch(branchInfo.scm.current);
	};

	useDidMount(() => {
		getBranches();
	});

	const branchInfo = React.useMemo(async () => {
		await getBranches();
	}, [derivedState.textEditorUri]);

	const same = label == status.label && icon == status.icon;

	console.warn("SAME: ", same);
	console.warn("STATUS: ", status);
	console.warn("LABEL: ", label);
	const showMoveIssueCheckbox = React.useMemo(() => {
		return !same && label && label.startsWith("http");
	}, [label, same]);
	const showCreateBranchCheckbox = React.useMemo(() => {
		return !same && label; // && label.startsWith("http");
	}, [label, same]);

	const save = async () => {
		setLoading(true);

		HostApi.instance.track("Status Set", { Value: status });

		if (createBranch && branch.length > 0 && derivedState.textEditorUri) {
			const uri = derivedState.textEditorUri;
			const request = branches.includes(branch) ? SwitchBranchRequestType : CreateBranchRequestType;
			const result = await HostApi.instance.send(request, { branch, uri });
			console.warn("GOT A RESXULT OF: ", result);
			// FIXME handle error
			if (result.error) {
				console.log("ERROR FROM SELECT BRANCH: ", result.error);
				setScmError(result.error);
				setLoading(false);
				return;
			}
		}

		if (moveIssue) {
			// FIXME move the issue to the selected list
			// const response = await HostApi.instance.send(MoveThirdPartyCardRequestType, {
			// 	providerId: props.provider.id,
			// 	destinationListId: FIXME
			// 	card
			// });
		}

		// @ts-ignore
		await dispatch(setUserStatus(icon, label, null));
		dispatch(closePanel());
		setLoading(false);
	};

	const clear = async () => {
		setLoading(true);
		HostApi.instance.track("Status Cleared", { Value: status });
		// @ts-ignore
		await dispatch(setUserStatus("", "", 0));
		dispatch(closePanel());
		setLoading(false);
	};

	const set = (icon: string, label: string) => {
		setIcon(icon);
		setLabel(label);
	};

	// const clearable = same && label && label.length > 0;
	// const saveable = !same;

	const handleClickEmojiButton = (event: React.SyntheticEvent) => {
		event.persist();
		setEmojiMenuTarget(event.target);
		setEmojiMenuOpen(!emojiMenuOpen);
	};

	const selectEmoji = (emoji: typeof emojiData[string]) => {
		setEmojiMenuOpen(false);
		if (emoji && emoji.colons) {
			setIcon(emoji.colons);
		}
	};

	const saveLabel =
		!label || label.length === 0
			? "Clear Status"
			: !branch || branch == currentBranch || !createBranch
			? "Save Status"
			: branches.includes(branch)
			? "Switch Branch & Save Status"
			: "Create Branch & Save Status";

	const useBranchLabel =
		branch == currentBranch
			? "Use branch"
			: branches.includes(branch)
			? "Switch to branch"
			: "Create branch";

	const makeMenuItem = (branch: string, isNew?: boolean) => {
		const iconName = branch == currentBranch ? "arrow-right" : "blank";
		return {
			label: (
				<span>
					{branch == currentBranch ? "Use " : "Switch to "}
					<span className="monospace highlight">
						<b>{branch}</b>
					</span>
					{branch == currentBranch && <> (current)</>}
				</span>
			),
			key: branch,
			icon: <Icon name={iconName} />,
			action: () => setBranch(branch)
		};
	};

	const branchMenuItems = branches.map(branch => makeMenuItem(branch, false)) as any;
	if (newBranch) {
		branchMenuItems.unshift(
			{ label: "-" },
			{
				label: "Edit Branch Name",
				key: "edit",
				icon: <Icon name="pencil" />,
				action: () => setEditingBranch(true)
			},
			{
				label: "Configure Branch Naming",
				key: "configure",
				icon: <Icon name="gear" />,
				action: () => setConfigureBranchNames(true)
			},
			{ label: "-" },
			{
				label: (
					<span>
						Create{" "}
						<span className="monospace highlight">
							<b>{newBranch}</b>
						</span>
					</span>
				),
				key: newBranch,
				icon: <Icon name="plus" />,
				action: () => setBranch(newBranch)
			}
		);
	}

	if (configureBranchNames)
		return <ConfigureBranchNames onClose={() => setConfigureBranchNames(false)} />;

	return (
		<div className="full-height-panel">
			<form className="standard-form vscroll" style={{ padding: "10px" }}>
				<div className="panel-header">
					What are you working on?
					<CancelButton onClick={props.closePanel} placement="left" />
				</div>
				<fieldset className="form-body" style={{ padding: "10px" }}>
					<div id="controls">
						<StatusInput>
							<div className="icon-selector">
								<span className="selected-emoji" onClick={handleClickEmojiButton}>
									{emojiPlain(icon)}
								</span>
								{emojiMenuOpen && (
									<EmojiPicker addEmoji={selectEmoji} target={emojiMenuTarget} autoFocus={true} />
								)}
							</div>
							{!label ? (
								<CrossPostIssueContext.Provider
									value={{
										selectedAssignees: [],
										setValues: values =>
											setTheLabel(
												values.url,
												replaceTicketTokens(
													derivedState.branchTicketTemplate,
													values.id,
													values.description
												)
											),
										setSelectedAssignees: () => {}
									}}
								>
									<IssueDropdown />
								</CrossPostIssueContext.Provider>
							) : (
								<div
									className="clear"
									onClick={() => {
										set(":desktop_computer:", "");
										setScmError("");
										const input = document.getElementById("status-input");
										if (input) input.focus();
									}}
								>
									<Icon name="x" className="clickable" />
								</div>
							)}
							<input
								id="status-input"
								name="status"
								value={label}
								className="input-text control"
								autoFocus={true}
								type="text"
								onChange={e => setTheLabel(e.target.value, makeBranchName(e.target.value))}
								placeholder="Enter description or select ticket"
							/>
						</StatusInput>
						<div style={{ paddingLeft: "6px" }}>
							{showCreateBranchCheckbox && (
								<StyledCheckbox
									name="create-branch"
									checked={createBranch}
									onChange={v => setCreateBranch(v)}
								>
									{useBranchLabel}{" "}
									{editingBranch ? (
										<input
											id="branch-input"
											name="branch"
											value={branch}
											className="input-text control"
											autoFocus={true}
											type="text"
											onChange={e => {
												setBranch(e.target.value);
												setBranchTouched(true);
											}}
											placeholder="Enter branch name"
											onBlur={() => setEditingBranch(false)}
											onKeyPress={e => {
												if (e.key == "Enter") setEditingBranch(false);
											}}
											style={{ width: "200px" }}
										/>
									) : (
										<MonoMenu title="Branch" items={branchMenuItems}>
											{branch}
										</MonoMenu>
									)}
								</StyledCheckbox>
							)}
							{showMoveIssueCheckbox && (
								<StyledCheckbox
									name="move-issue"
									checked={moveIssue}
									onChange={v => setMoveIssue(v)}
								>
									Move this card to{" "}
									<InlineMenu items={[{ label: "foo", key: "bar" }]}>In Progress</InlineMenu>
									on Trello
								</StyledCheckbox>
							)}
						</div>
						<div style={{ height: "5px" }}></div>
						{scmError && <SCMError>{scmError}</SCMError>}
						{!same && (
							<ButtonRow>
								<Button onClick={save} isLoading={loading}>
									{saveLabel}
								</Button>
							</ButtonRow>
						)}
						<div style={{ marginTop: "20px", textAlign: "center" }}>
							<div style={{ display: "inline-block" }}>
								<VideoLink href={"step.video"}>
									<img src="https://i.imgur.com/9IKqpzf.png" />
									<span>How do I grab a ticket &amp; create a branch?</span>
								</VideoLink>
							</div>
						</div>
					</div>
				</fieldset>
			</form>
		</div>
	);
};

// {false && label.length === 0 && (
// 	<Examples>
// 		<div onClick={() => set(":house:", "Working remotely", "today")}>
// 			<span className="emoji">{emojiPlain(":house:")}</span>
// 			Working remotely
// 			<span className="time"> &mdash; Today</span>
// 		</div>
// 		<div onClick={() => set(":bus:", "Commuting", "30")}>
// 			<span className="emoji">{emojiPlain(":bus:")}</span>
// 			Commuting
// 			<span className="time"> &mdash; 30 minutes</span>
// 		</div>
// 		<div onClick={() => set(":calendar:", "In a meeting", "60")}>
// 			<span className="emoji">{emojiPlain(":calendar:")}</span>
// 			In a meeting
// 			<span className="time"> &mdash; 1 hour</span>
// 		</div>
// 		<div onClick={() => set(":brain:", "Deep in thought", "120")}>
// 			<span className="emoji">{emojiPlain(":brain:")}</span>
// 			Deep in thought
// 			<span className="time"> &mdash; 2 hours</span>
// 		</div>
// 		<div onClick={() => set(":desktop_computer:", "Heads down", "240")}>
// 			<span className="emoji">{emojiPlain(":desktop_computer:")}</span>
// 			Heads down
// 			<span className="time"> &mdash; 4 hours</span>
// 		</div>
// 	</Examples>
// )}