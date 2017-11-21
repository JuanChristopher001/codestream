import React, { Component } from "react";
import { FormattedMessage } from "react-intl";
import withAPI from "./withAPI";
import Button from "./Button";
import { post } from "../network-request";

export class SimpleTeamCreation extends Component {
	constructor(props) {
		super(props);
		this.state = {
			name: "",
			nameTouched: false
		};
	}

	onBlurName = () => this.setState(state => ({ nameTouched: true }));

	onSubmit = () => {
		this.setState({ loading: true });
		const { store, createTeam } = this.props;
		const { name } = this.state;
		const { url, firstCommitHash } = store.getState().repoMetaData;
		createTeam({ name, url, firstCommitHash })
			.then(data => {
				this.setState({ loading: false });
				atom.notifications.addInfo("Success! More to come...");
			})
			.catch(() => this.setState({ loading: false }));
	};

	render() {
		return (
			<div id="team-creation">
				<h2>
					<FormattedMessage id="createTeam.header" />
				</h2>
				<p>
					<FormattedMessage id="createTeam.info" />
				</p>
				<p>
					<FormattedMessage id="createTeam.additionalInfo" />
				</p>
				<form onSubmit={this.onSubmit}>
					<input
						className="native-key-bindings input-text control"
						placeholder="Team Name"
						onChange={event => this.setState({ name: event.target.value })}
						value={this.state.name}
						onBlur={this.onBlurName}
						required={this.state.touched}
					/>
					<Button id="submit-button" disabled={this.state.name === ""} loading={this.state.loading}>
						<FormattedMessage id="createTeam.submitButton" />
					</Button>
				</form>
			</div>
		);
	}
}

const createTeam = (store, attributes) => {
	const params = {
		url: attributes.url,
		firstCommitHash: attributes.firstCommitHash,
		team: {
			name: attributes.name
		}
	};
	return post("/repos", params, store.getState().accessToken).then(data => {
		store.setState({
			...store.getState(),
			...data
		});
	});
};

export default withAPI({ createTeam })(SimpleTeamCreation);
