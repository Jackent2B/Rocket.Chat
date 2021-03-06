import { ReactiveVar } from 'meteor/reactive-var';
import { Session } from 'meteor/session';
import { Template } from 'meteor/templating';
import { TAPi18n } from 'meteor/rocketchat:tap-i18n';
import _ from 'underscore';
import s from 'underscore.string';
import moment from 'moment';

import { DateFormat } from '../../../lib';
import { popover } from '../../../ui-utils';
import { templateVarHandler } from '../../../utils';
import { RoomRoles, UserRoles, Roles } from '../../../models';
import { settings } from '../../../settings';
import { getActions } from './userActions';
import './userInfo.html';
import { APIClient } from '../../../utils/client';

const shownActionsCount = 2;

const moreActions = function() {
	return (
		Template.instance().actions.get()
			.map((action) => (typeof action === 'function' ? action.call(this) : action))
			.filter((action) => action && (!action.condition || action.condition.call(this)))
			.slice(shownActionsCount)
	);
};

Template.userInfo.helpers({
	hideHeader() {
		return ['Template.adminUserInfo', 'adminUserInfo'].includes(Template.parentData(2).viewName);
	},

	moreActions,

	actions() {
		return Template.instance().actions.get()
			.map((action) => (typeof action === 'function' ? action.call(this) : action))
			.filter((action) => action && (!action.condition || action.condition.call(this)))
			.slice(0, shownActionsCount);
	},

	customField() {
		const sCustomFieldsToShow = settings.get('Accounts_CustomFieldsToShowInUserInfo').trim();
		const customFields = [];

		if (sCustomFieldsToShow) {
			const user = Template.instance().user.get();
			const userCustomFields = (user && user.customFields) || {};
			const listOfCustomFieldsToShow = JSON.parse(sCustomFieldsToShow);

			_.map(listOfCustomFieldsToShow, (el) => {
				let content = '';
				if (_.isObject(el)) {
					_.map(el, (key, label) => {
						const value = templateVarHandler(key, userCustomFields);
						if (value) {
							content = { label, value };
						}
					});
				} else {
					content = templateVarHandler(el, userCustomFields);
				}
				if (content) {
					customFields.push(content);
				}
			});
		}
		return customFields;
	},
	uid() {
		const user = Template.instance().user.get();
		return user._id;
	},
	name() {
		const user = Template.instance().user.get();
		return user && user.name ? user.name : TAPi18n.__('Unnamed');
	},

	username() {
		const user = Template.instance().user.get();
		return user && user.username;
	},

	userStatus() {
		const user = Template.instance().user.get();
		const userStatus = Session.get(`user_${ user.username }_status`);
		return userStatus || TAPi18n.__('offline');
	},

	userStatusText() {
		if (s.trim(this.statusText)) {
			return this.statusText;
		}

		const user = Template.instance().user.get();
		const userStatus = Session.get(`user_${ user.username }_status`);
		return userStatus || TAPi18n.__('offline');
	},

	email() {
		const user = Template.instance().user.get();
		return user && user.emails && user.emails[0] && user.emails[0].address;
	},

	utc() {
		const user = Template.instance().user.get();
		if (user && user.utcOffset != null) {
			if (user.utcOffset > 0) {
				return `+${ user.utcOffset }`;
			}
			return user.utcOffset;
		}
	},

	lastLogin() {
		const user = Template.instance().user.get();
		if (user && user.lastLogin) {
			return DateFormat.formatDateAndTime(user.lastLogin);
		}
	},

	createdAt() {
		const user = Template.instance().user.get();
		if (user && user.createdAt) {
			return DateFormat.formatDateAndTime(user.createdAt);
		}
	},
	linkedinUsername() {
		const user = Template.instance().user.get();
		if (user && user.services && user.services.linkedin && user.services.linkedin.publicProfileUrl) {
			return s.strRight(user.services.linkedin.publicProfileUrl, '/in/');
		}
	},

	servicesMeteor() {
		const user = Template.instance().user.get();
		return user && user.services && user.services['meteor-developer'];
	},

	userTime() {
		const user = Template.instance().user.get();
		if (user && user.utcOffset != null) {
			return DateFormat.formatTime(Template.instance().now.get().utcOffset(user.utcOffset));
		}
	},

	user() {
		return Template.instance().user.get();
	},

	hasEmails() {
		return _.isArray(this.emails);
	},

	hasPhone() {
		return _.isArray(this.phone);
	},

	isLoading() {
		return Template.instance().loadingUserInfo.get();
	},

	editingUser() {
		return Template.instance().editingUser.get();
	},

	userToEdit() {
		const instance = Template.instance();
		const data = Template.currentData();
		return {
			user: instance.user.get(),
			back({ _id, username }) {
				instance.editingUser.set();

				if (_id) {
					data.onChange && data.onChange();
					return instance.loadUser({ _id });
				}

				if (username != null) {
					const user = instance.user.get();
					if ((user != null ? user.username : undefined) !== username) {
						data.username = username;
						return instance.loadedUsername.set(username);
					}
				}
			},
		};
	},

	roleTags() {
		const user = Template.instance().user.get();
		if (!user || !user._id) {
			return;
		}
		const userRoles = UserRoles.findOne(user._id) || {};
		const roomRoles = RoomRoles.findOne({ 'u._id': user._id, rid: Session.get('openedRoom') }) || {};
		const roles = _.union(userRoles.roles || [], roomRoles.roles || []);
		return roles.length && Roles.find({ _id: { $in: roles }, description: { $exists: 1 } }, { fields: { description: 1 } });
	},

	shouldDisplayReason() {
		const user = Template.instance().user.get();
		return settings.get('Accounts_ManuallyApproveNewUsers') && user.active === false && user.reason;
	},
});

Template.userInfo.events({
	'click .js-more'(e, instance) {
		const actions = moreActions.call(this);
		const groups = [];
		const columns = [];
		const admin = actions.filter((actions) => actions.group === 'admin');
		const others = actions.filter((action) => !action.group);
		const channel = actions.filter((actions) => actions.group === 'channel');
		if (others.length) {
			groups.push({ items: others });
		}
		if (channel.length) {
			groups.push({ items: channel });
		}

		if (admin.length) {
			groups.push({ items: admin });
		}
		columns[0] = { groups };

		$(e.currentTarget).blur();
		e.preventDefault();
		e.stopPropagation();
		const config = {
			columns,
			data: {
				rid: this._id,
				username: instance.data.username,
				instance,
			},
			currentTarget: e.currentTarget,
			offsetVertical: e.currentTarget.clientHeight + 10,
		};
		popover.open(config);
	},
	'click .js-action'(e) {
		return this.action && this.action.apply(this, [e, { instance: Template.instance() }]);
	},
	'click .js-close-info'(e, instance) {
		return instance.clear();
	},
	'click .js-back'(e, instance) {
		return instance.clear();
	},
});

Template.userInfo.onCreated(function() {
	this.now = new ReactiveVar(moment());
	this.user = new ReactiveVar();
	this.actions = new ReactiveVar();

	this.autorun(() => {
		const user = this.user.get();
		if (!user) {
			this.actions.set([]);
			return;
		}
		const actions = getActions({
			user,
			hideAdminControls: this.data.hideAdminControls,
			directActions: this.data.showAll,
		});
		this.actions.set(actions);
	});
	this.editingUser = new ReactiveVar();
	this.loadingUserInfo = new ReactiveVar(true);
	this.tabBar = Template.currentData().tabBar;
	this.nowInterval = setInterval(() => this.now.set(moment()), 30000);

	this.loadUser = async ({ _id, username }) => {
		this.loadingUserInfo.set(true);

		const params = {};

		if (_id != null) {
			params.userId = _id;
		} else if (username != null) {
			params.username = username;
		} else {
			return;
		}

		const { user } = await APIClient.v1.get('users.info', params);
		this.user.set(user);
		this.loadingUserInfo.set(false);
	};

	this.autorun(async () => {
		const data = Template.currentData();
		if (!data) {
			return;
		}

		this.loadUser(data);
	});

	this.autorun(() => {
		const data = Template.currentData();
		if (data.clear != null) {
			this.clear = data.clear;
		}
	});
});

Template.userInfo.onDestroyed(function() {
	clearInterval(this.nowInterval);
});
