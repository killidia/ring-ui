/**
 * @fileoverview Query Assist
 * @jsx React.DOM
 */

var React = require('react');
var $ = require('jquery');
var when = require('when');
var debounce = require('mout/function/debounce');
var equals = require('mout/array/equals');
var pick = require('mout/object/pick');
var filter = require('mout/object/filter');
var isNumber = require('mout/lang/isNumber');
require('jquery-caret');

var NgModelMixin = require('ngmodel/ngmodel');
var PopupMenu = require('../popup-menu/popup-menu');
var Icon = require('../icon/icon'); // jshint -W098
var Shortcuts = require('shortcuts/shortcuts');
var Global = require('global/global');

var generateUniqueId = Global.getUIDGenerator('ring-query-assist-');

require('./query-assist.scss');
require('../input/input.scss');

// Use for IE11 and down to 9
var impotentIE = document.documentMode <= 11;  // TODO Proper browser detection?
var mutationEvents = 'DOMCharacterDataModified DOMNodeInserted DOMNodeRemoved DOMSubtreeModified';

function rangeEquals(a, b) {
  // jshint -W116
  return a == b || a != null && b != null && a.length === b.length && a.start === b.start && a.style === b.style;
  // jshint +W116
}

/**
 * @name QueryAssist
 * @constructor
 * @mixes {Shortcuts.Mixin}
 * @extends {ReactComponent}
   <example name="QueryAssist">
     <file name="index.html">
       <div id="example">
       </div>
     </file>

     <file name="index.js" webpack="true">
       var React = require('react');
       var QueryAssist = require('./query-assist.jsx');

       React.renderComponent(QueryAssist(null), document.getElementById('example'));
     </file>
   </example>
 */
var ngModelStateField = {query: true, caret: true};
var QueryAssist = React.createClass({
  mixins: [Shortcuts.Mixin, NgModelMixin],
  ngModelStateField: ngModelStateField,
  statics: {
    ngModelStateField: ngModelStateField
  },

  /** @override */
  propTypes: {
    caret: React.PropTypes.number,
    className: React.PropTypes.string,
    popupClassName: React.PropTypes.string,
    dataSource: React.PropTypes.func.isRequired,
    disabled: React.PropTypes.bool,
    focus: React.PropTypes.bool,
    hint: React.PropTypes.string,
    hintOnSelection: React.PropTypes.string,
    glass: React.PropTypes.bool,
    placeholder: React.PropTypes.string,
    onApply: React.PropTypes.func,
    onChange: React.PropTypes.func,
    onFocusChange: React.PropTypes.func,
    query: React.PropTypes.string
  },

  getInitialState: function () {
    return {
      query: this.props.query,
      caret: isNumber(this.props.caret) ? this.props.caret : this.props.query && this.props.query.length,
      focus: this.props.focus
    };
  },

  getDefaultProps: function () {
    return {shortcuts: true};
  },

  getShortcutsProps: function () {
    return {
      map: {
        'enter': this.handleComplete,
        'ctrl+space': this.handleCtrlSpace,
        'tab': this.handleTab
      },
      scope: generateUniqueId()
    };
  },

  // See http://stackoverflow.com/questions/12353247/force-contenteditable-div-to-stop-accepting-input-after-it-loses-focus-under-web
  blurInput: function() {
    window.getSelection().removeAllRanges();
  },

  componentDidMount: function () {
    var styleRangesRequested = this.requestStyleRanges();

    if (!styleRangesRequested) {
      this.setFocus();
    }

    if (impotentIE) {
      $(this.getDOMNode()).on(mutationEvents, debounce(this.handleInput, 0));
    }

    /**
     * Delay request data. For each component create separate instance of
     * delayed function.
     * this will reduce the load on the server if the user quickly enters data
     */
    var requestTimeDelay = 100;
    this.requestData = debounce(this.requestData, requestTimeDelay);
  },

  componentWillUnmount: function() {
    if (impotentIE) {
      $(this.getDOMNode()).off(mutationEvents);
    }
  },

  propsToPick: {
    query: 'string',
    caret: 'number',
    focus: 'boolean'
  },

  componentWillReceiveProps: function (props) {
    if (props.focus === false && this.state.focus === true) {
      this.blurInput();
    }

    var state = filter(props, function(value, key) {
      return typeof value === this.propsToPick[key];
    }, this);


    if (!Object.keys(state).length) {
      return;
    }

    var updateStyles = state.query && (state.query !== this.getQuery() || !this.state.styleRanges);
    this.setState(state, updateStyles ? this.requestStyleRanges : this.handleNothing);
  },

  componentDidUpdate: function () {
    this.setFocus();
  },

  setFocus: function() {
    var input = this.refs.input.getDOMNode();
    var queryLength = this.state.query && this.state.query.length;
    var caret = this.state.caret < queryLength ? this.state.caret : queryLength;

    if (this.state.focus && !this.props.disabled) {
      // $.caret cannot place caret without children, so we just focus instead
      if (input.firstChild && isNumber(caret)) {
        $(input).caret(caret);
      } else {
        input.focus();
      }
    }
  },

  handleFocusChange: function (e) {
    // otherwise it's blur and false
    var focus = e.type === 'focus';

    if (!focus) {
      this.blurInput();
    }

    if (typeof this.props.onFocusChange === 'function') {
      this.props.onFocusChange({focus: focus});
    }

    this.setState({focus: focus, shortcuts: focus});
  },

  handleInput: function () {
    var props = {
      query: this.getQuery(),
      caret: this.getCaret()
    };

    // Avoid trigger on init by mutatuion events in IE
    if (props.query === this.state.query && props.query === '') {
      return;
    }

    if (typeof this.props.onChange === 'function') {
      this.props.onChange(props);
    }

    this.setState(props, this.requestData);
  },

  // It's necessary to prevent new element creation before any other hooks
  handleEnter: function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
    }
  },

  handleTab: function (e) {
    var selected = this._popup && this._popup.refs.List.getSelected();
    var firstSuggestion = this.state.suggestions && this.state.suggestions[0];

    if (selected || firstSuggestion) {
      e.preventDefault();
      return this.handleComplete(selected || {data: firstSuggestion}, true);
    }

    return true;
  },

  handleCaretMove: function (e) {
    var caret = this.getCaret();
    var popupHidden = (!this._popup || !this._popup.isVisible()) && e.type === 'click';

    if (!this.props.disabled && (caret !== this.state.caret || popupHidden)) {
      this.setState({caret: caret}, this.requestData);
    }
  },

  handleResponse: function (props) {
    var deferred = when.defer();
    var pickedProps = pick(props, ['query', 'caret', 'styleRanges', 'suggestions']);

    if (pickedProps.query === this.state.query &&
       (pickedProps.caret === this.state.caret || this.state.caret === undefined)) {
      this.setState(pickedProps, deferred.resolve);
    } else {
      deferred.reject(new Error('Current and response queries mismatch'));
    }

    return deferred.promise;
  },

  handleApply: function() {
    var state = this.getInputState();

    if (typeof this.props.onApply === 'function') {
      this.closePopup();
      return this.props.onApply(state);
    }
  },

  handleComplete: function (data, replace) {
    var state = this.getInputState();

    if (!data || !data.data) {
      this.handleApply();

      return;
    }

    var suggestion = data.data;
    var prefix = suggestion.prefix || '';
    var suffix = suggestion.suffix || '';

    var props = {
      caret: suggestion.caret,
      query: state.query.substr(0, suggestion.completionStart) + prefix + suggestion.option + suffix
    };

    if (replace) {
      props.query += state.query.substr(suggestion.completionEnd + suffix.length);
    } else {
      props.query += state.query.substr(state.caret);
    }

    if (typeof this.props.onChange === 'function') {
      this.props.onChange(props);
    }

    // Force focus on complete e.g. after click
    props.focus = true;

    this.setState(props, this.requestData);
  },

  // TODO Do something here :)
  handleNothing: function() {},

  requestStyleRanges: function() {
    var state = this.getInputState();

    if (!state.query) {
      return false;
    }

    state.omitSuggestions = true;
    //To prevent duplicate requests while inital styleranges is loading
    this.state.styleRanges = this.state.styleRanges || [];
    this.sendRequest(state)
      .then(this.handleResponse)
      .catch(this.handleNothing);

    return true;
  },

  requestData: function() {
    this.sendRequest(this.getInputState()).
      then(this.handleResponse).
      then(this.renderPopup).
      catch(this.handleNothing);
  },

  sendRequest: function (params) {
    var dataPromise = when(this.props.dataSource(params));
    // Close popup after timeout
    // TODO Show loader here
    dataPromise.timeout(500).
      catch(when.TimeoutError, this.closePopup).
      catch(this.handleNothing);

    return dataPromise;
  },

  getInputState: function() {
    return {
      query: this.state.query,
      caret: this.state.caret
    };
  },

  getQuery: function () {
    return $(this.refs.input.getDOMNode()).text().replace(/\s/g, ' ');
  },

  getCaret: function () {
    return $(this.refs.input.getDOMNode()).caret();
  },

  getCaretOffset: function () {
    var input = this.refs.input.getDOMNode();
    // First suggestion should be enough?
    var suggestion = this.state.suggestions && this.state.suggestions[0];
    // Check of suggestion begins not from the end
    var completionStart = suggestion && suggestion.completionEnd !== suggestion.completionStart && suggestion.completionStart;
    var caretNodeNumber = completionStart != null && completionStart !== false ? completionStart : this.state.caret - 1;
    var caretNode = input.firstChild && input.firstChild.childNodes[caretNodeNumber];
    var caretOffset = caretNode && (caretNode.offsetLeft + caretNode.offsetWidth - PopupMenu.ListProps.Dimensions.ITEM_PADDING) || 0;

    return caretOffset < 0 ? 0 : caretOffset;
  },

  // TODO Move to renderLeter and simplify
  getLetterClass: function (index) {
    var LETTER_CLASS = 'ring-query-assist__letter';

    return this.state.styleRanges &&
      this.state.styleRanges.
        filter(function (item) {
          return item.start <= index && item.start + item.length > index;
        }).
        map(function (item) {
          return LETTER_CLASS + '_' + item.style.replace('_', '-');
        }).
        concat(LETTER_CLASS).
        join(' ') ||
      LETTER_CLASS;
  },

  handleCtrlSpace: function (e) {
    e.preventDefault();

    if (this.state.suggestions) {
      this.renderPopup();
    } else {
      this.requestData();
    }
  },

  renderPopup: function () {
    var suggestions = this.renderSuggestions();

    if (!suggestions.length) {
      this.closePopup();
      return;
    }

    if (!this._popup) {
      this._popup = PopupMenu.renderComponent(
        /* jshint ignore:start */
        <PopupMenu
          className={this.props.popupClassName}
          anchorElement={this.getDOMNode()}
          corner={PopupMenu.PopupProps.Corner.BOTTOM_LEFT}
          hint={this.props.hint}
          hintOnSelection={this.props.hintOnSelection}
          data={suggestions} shortcuts={true}
          left={this.getCaretOffset()}
          onSelect={this.handleComplete}
          maxHeight="screen"
        />
        /* jshint ignore:end */
      );
    } else {
      this._popup.setProps({
        data: suggestions,
        hidden: false,
        hint: this.props.hint,
        hintOnSelection: this.props.hintOnSelection,
        left: this.getCaretOffset()
      });
    }
  },

  closePopup: function() {
    if (this._popup) {
      this._popup.hide();
    }
  },

  renderSuggestions: function () {
    var suggestions = [];

    if (!this.state.suggestions) {
      return suggestions;
    }

    this.state.suggestions.forEach(function (suggestion, index, arr) {
      var prevSuggestion = arr[index - 1] && arr[index - 1].group;

      if (prevSuggestion !== suggestion.group) {

        suggestions.push({
          key: suggestion.option + suggestion.group + PopupMenu.ListProps.Type.SEPARATOR,
          description: suggestion.group,
          type: PopupMenu.ListProps.Type.SEPARATOR
        });
      }

      var label;

      /* jshint ignore:start */
      var option;
      var before = false;
      var after = false;
      if (suggestion.matchingStart !== suggestion.matchingEnd) {
        before = suggestion.option.substring(0, suggestion.matchingStart);
        option = <span className="ring-list__highlight">{suggestion.option.substring(suggestion.matchingStart, suggestion.matchingEnd)}</span>;
        after = suggestion.option.substring(suggestion.matchingEnd);
      } else {
        option = suggestion.option;
      }

      var prefix = !!suggestion.prefix && <span className="ring-list__service">{suggestion.prefix}</span>;
      var suffix = !!suggestion.suffix && <span className="ring-list__service">{suggestion.suffix}</span>;

      label = React.DOM.span(null, prefix, before, option, after, suffix);
      /* jshint ignore:end */

      var item = {
        key:  suggestion.prefix + suggestion.option + suggestion.suffix + suggestion.group + suggestion.description,
        label: label,
        type: PopupMenu.ListProps.Type.ITEM,
        data: suggestion
      };

      if (!suggestion.group) {
        item.description = suggestion.description;
      }

      if (suggestion.icon) {
        item.icon = suggestion.icon;
      }

      suggestions.push(item);
    });

    return suggestions;
  },

  /* jshint ignore:start */
  renderLetter: function (letter, index) {
    // \u00a0 === &nbsp;
    var letterValue = letter === ' ' ? '\u00a0' : letter;
    // Despite warning we don't need key here because of renderComponentToStaticMarkup
    return <span className={this.getLetterClass(index)}>{letterValue}</span>
  },
  /* jshint ignore:end */

  /** @override */
  render: function () {
    /* jshint ignore:start */
    var renderPlaceholder = !!this.props.placeholder && !this.state.query;
    var inputClasses = React.addons.classSet({
      'ring-query-assist__input ring-input ring-js-shortcuts': true,
      'ring-query-assist__input_glass': this.props.glass,
      'ring-input_disabled': this.props.disabled
    });

    var query = this.state.query && React.renderComponentToStaticMarkup(
      <span>{this.state.query.split('').map(this.renderLetter)}</span>
    ) || '';

    return (
      <div className="ring-query-assist">
        <div className={inputClasses} ref="input"
          onInput={this.handleInput} onKeyPress={this.handleEnter} onKeyDown={this.handleEnter} onKeyUp={this.handleCaretMove}
          onClick={this.handleCaretMove} onFocus={this.handleFocusChange} onBlur={this.handleFocusChange}
          spellCheck="false" contentEditable={!this.props.disabled} dangerouslySetInnerHTML={{__html: query}}></div>

        {renderPlaceholder && <span className="ring-query-assist__placeholder" onClick={this.handleCaretMove}>{this.props.placeholder}</span>}
        {this.props.glass &&
          <Icon
            onClick={this.handleApply}
            size={Icon.Size.Size16}
            glyph="search"
            color="gray"
            className="ring-query-assist__glass">
          </Icon>}
      </div>
    );
    /* jshint ignore:end */
  }
});

module.exports = QueryAssist;
