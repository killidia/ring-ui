import 'dom4';
import React from 'react';
import classNames from 'classnames';
import PropTypes from 'prop-types';

import {
  ExceptionIcon,
  CheckmarkIcon,
  WarningIcon,
  CloseIcon
} from '../icon';
import RingComponent from '../ring-component/ring-component';
import Loader from '../loader-inline/loader-inline';
import Badge from '../badge/badge';
import {getRect} from '../global/dom';

import styles from './alert.css';

const ANIMATION_TIME = 500;

/**
 * @name Alert
 * @category Components
 * @description Use **Alert** to display contextual notifications. If you want to display a stack of notifications, use **Alerts** instead.
 */

/**
 * List of available alert types.
 * @enum {string}
 */
const Type = {
  ERROR: 'error',
  MESSAGE: 'message',
  SUCCESS: 'success',
  WARNING: 'warning',
  LOADING: 'loading'
};

/**
 * Lookup table of alert type to icon modifier.
 * @type {Object.<Type, string>}
 */
const TypeToIcon = {
  [Type.ERROR]: ExceptionIcon,
  [Type.SUCCESS]: CheckmarkIcon,
  [Type.WARNING]: WarningIcon
};

/**
 * Lookup table of alert type to icon color.
 * @type {Object.<Type, Icon.Color>}
 */
const TypeToIconColor = {
  [Type.ERROR]: ExceptionIcon.Color.RED,
  [Type.SUCCESS]: CheckmarkIcon.Color.GREEN,
  [Type.WARNING]: WarningIcon.Color.ORANGE
};

/**
 * @constructor
 * @name Alert
 * @extends {ReactComponent}
 * @example-file ./alert.examples.html
 */
export default class Alert extends RingComponent {
  static Type = Type;

  static propTypes = {
    timeout: PropTypes.number,
    onCloseRequest: PropTypes.func,
    onClose: PropTypes.func,
    count: PropTypes.number,
    isClosing: PropTypes.bool,
    inline: PropTypes.bool,
    showWithAnimation: PropTypes.bool,
    closeable: PropTypes.bool,
    type: PropTypes.oneOf(Object.values(Type)),

    children: PropTypes.node,
    className: PropTypes.string
  };

  /** @override */
  static defaultProps = {
    /** @type {boolean} */
    closeable: true,
    showWithAnimation: true,
    type: Type.MESSAGE,
    /**
     * Whether an alert is rendered inside an {@code Alerts} container
     * or standalone.
     * @type {boolean}
     */
    inline: true,
    isClosing: false,
    timeout: 0,
    onClose: () => {},
    /**
     * Fires when alert starts closing if timeout is out or user clicks "Close" button
     * @type {?function(SyntheticMouseEvent):undefined}
     */
    onCloseRequest: () => {}
  };

  state = {
    height: null
  };

  willReceiveProps(newProps) {
    if (newProps.isClosing) {
      this._close();
    }
  }

  didMount() {
    if (this.props.timeout > 0) {
      this.hideTimeout = setTimeout(this.closeRequest, this.props.timeout);
    }
  }

  willUnmount() {
    clearTimeout(this.hideTimeout);
  }

  closeRequest = (...args) => {
    const height = getRect(this.node).height;
    this.setState({height});
    return this.props.onCloseRequest(...args);
  };

  _close() {
    setTimeout(() => {
      this.props.onClose();
    }, ANIMATION_TIME);
  }

  /**
   * @param {SyntheticEvent} evt
   * @private
   */
  _handleCaptionsLinksClick = evt => {
    if (evt.target.matches('a')) {
      this.closeRequest(evt);
    }
  };

  /**
   * @private
   */
  _getCaption() {
    return (
      <span
        className={styles.caption}
        onClick={this._handleCaptionsLinksClick}
      >
        {this.props.children}
        {this.props.count > 1 &&
          <Badge
            gray={true}
            className={styles.badge}
          >{this.props.count}</Badge>
        }
      </span>
    );
  }

  /**
   * @private
   * @return {XML|string}
   */
  _getIcon() {
    const Icon = TypeToIcon[this.props.type];

    if (Icon) {
      return (
        <Icon
          className={styles.icon}
          color={TypeToIconColor[this.props.type] || Icon.Color.DEFAULT}
          size={Icon.Size.Size16}
        />
      );
    } else if (this.props.type === Type.LOADING) {
      return (
        <Loader className={styles.loader}/>
      );
    }

    return '';
  }

  render() {
    const {type, inline, isClosing, showWithAnimation, className} = this.props;

    const classes = classNames(className, {
      [styles.alert]: true,
      [styles.animationOpen]: showWithAnimation,
      [styles.error]: type === 'error',
      [styles.alertInline]: inline,
      [styles.animationClosing]: isClosing
    });

    const style = this.state.height ? {marginTop: -this.state.height} : null;

    return (
      <div
        className={classes}
        data-test="alert"
        style={style}
      >
        {this._getIcon()}
        {this._getCaption()}
        {
          this.props.closeable
            ? (
              <button
                className={styles.close}
                data-test="alert-close"
                onClick={this.closeRequest}
              >
                <CloseIcon
                  size={CloseIcon.Size.Size16}
                />
              </button>
            )
            : ''
        }
      </div>
    );
  }
}

export {default as Container} from './container';
