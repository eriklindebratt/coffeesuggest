/**
 * @param DOMElement/jQuery $inputElem
 * @param string ajaxSearchURIPrefix Used when querying server for suggestions corresponding to "'ajaxSearchURIPrefix' + query"
 * @param function onSuggestionPickCallback Fired when user picks a suggestion
 * @param array suggestionListGroupLabels [optional]
 * @param function listItemFormatter [optional] When set, this function will be called after each suggestion list item has been populated with initial content
 * @param function getSuggestionLabelFunction [optional] When set, this method will be called with item's complete data object to get its "label" value back
 * @param string searchURIPrefix [optional] When set, and user submits the input element (e.g. presses "return" key when input is focused) and no suggestion (if any) is selected, user will be redirected to "'searchURIPrefix' + query"
 * @param function getSuggestionURIFunction [optional] When set, this method will be called with item's complete data object to get its "URI" value back
 * @param string suggestionListLabel [optional] General label for entire collection, e.g. "Suggestions"
 * @param function onSearchStartCallback [optional]
 * @param function onSearchEndCallback [optional]
 */
CoffeeSuggest = function($inputElem, ajaxSearchURIPrefix, onSuggestionPickCallback, suggestionListGroupLabels, listItemFormatter, getSuggestionLabelFunction, searchURIPrefix, getSuggestionURIFunction, suggestionListLabel, onSearchStartCallback, onSearchEndCallback) {
  // statics
  this.SELECTED_ITEM_IDENTIFIER        = 'selected';
  this.SUGGESTION_LIST_CONTAINER_MARKUP  = '<div class="js-search-suggestions search-suggestions hide"><div class="js-inner inner clearfix"><div class="inner-right label-small light-grey">'+suggestionListLabel||'Suggestions'+'</div></div></div>';
  this.SUGGESTION_LIST_MARKUP           = '<ul class="js-list list clearfix"></ul>';
  this.SUGGESTION_LIST_ITEM_MARKUP       = '<li class="js-item item"></li>';
  this.SUGGESTION_LIST_ITEM_HEADER_MARKUP = '<div class="js-unselectable js-header item header bold uppercase light-grey"><span class="js-inner inner"></span></div>';

  this._$inputElem                             = ($inputElem instanceof jQuery) ? $inputElem.eq(0) : $(inputElem);
  this._ajaxSearchURIPrefix                    = ajaxSearchURIPrefix;
  this._onSuggestionPickCallback               = onSuggestionPickCallback;
  this._suggestionListGroupLabels              = suggestionListGroupLabels;
  this._listItemFormatter                      = listItemFormatter;
  this._getSuggestionLabelFunction             = getSuggestionLabelFunction
  this._searchURIPrefix                        = searchURIPrefix;
  this._onSearchStartCallback                  = onSearchStartCallback;
  this._onSearchEndCallback                    = onSearchEndCallback;
  this._getSuggestionURIFunction               = getSuggestionURIFunction
  this._inputElemHasFocus                      = false;
  this._currentInputValue                      = this._$inputElem.val();
  this._lastInputValue                         = this._currentInputValue;
  this._$suggestionListContainer               = null;
  this._$suggestionListItems                   = [];

  if (!this._$inputElem.length) {
    console.error('CoffeeSuggest: Invalid value for @param "$inputElem"');
    return null;
  }
  if (typeof this._ajaxSearchURIPrefix !== 'string') {
    console.error('CoffeeSuggest: Invalid value for @param "ajaxSearchURIPrefix"');
    return null;
  }
  if (typeof this._onSuggestionPickCallback !== 'function') {
    console.error('CoffeeSuggest: Invalid value for @param "onSuggestionPickCallback"');
    return null;
  }

  if (!this._$suggestionListContainer) {
    this._$suggestionListContainer = this._constructSuggestionListContainerElement();
    var $container = this._$inputElem.parents('.js-input-container').eq(0);
    if (!$container.length) $container = this._$inputElem.parent();
    if (!$container.length) $container = this._$inputElem.parent().parent();
    $container.append(this._$suggestionListContainer);
  }

  this._$inputElem
    .on('focus', $.proxy(this._onInputElemFocus, this))
    .on('blur', $.proxy(this._onInputElemBlur, this))
    .on('keyup', $.proxy(this._onKeyUp, this));
};

CoffeeSuggest.prototype._bindSuggestionListItemEvents = function() {
  var scope = this;
  this._$suggestionListContainer
    .on('mouseover', '.item', function(e) {
      if (scope._itemIsSelectable(e.currentTarget)) scope._onSuggestionListItemMouseOver(e);
    })
    .on('mouseout', '.item', function(e) {
      if (scope._itemIsSelectable(e.currentTarget)) scope._onSuggestionListItemMouseOut(e);
    })
    .on('click', '.item', function(e) {
      e.preventDefault();
      e.stopPropagation();
      scope._onSuggestionPick();
    })
};

CoffeeSuggest.prototype._unbindSuggestionListItemEvents = function() {
  this._$suggestionListContainer
    .off('mouseover', '.item')
    .off('mouseout', '.item')
    .off('click', '.item a');
};

CoffeeSuggest.prototype._onSuggestionListItemMouseOver = function(e) {
  this._selectItemAtIndex(e.currentTarget.listIndex);
};

CoffeeSuggest.prototype._onSuggestionListItemMouseOut = function(e) {
  this._unselectItemAtIndex(e.currentTarget.itemIndex);
};

CoffeeSuggest.prototype._onInputElemFocus = function(e) {
  this._inputElemHasFocus = true;
  if (this._hasSuggestions() && this._$suggestionListContainer) {
    this._toggleSuggestionList(true);
  }
};

CoffeeSuggest.prototype._onInputElemBlur = function() {
  var scope = this;
  setTimeout(function() {
    scope._inputElemHasFocus = false;
    if (scope._$suggestionListContainer) {
      scope._toggleSuggestionList(false);
    }
  }, 200);
};

CoffeeSuggest.prototype._onKeyUp = function(e) {
  switch (e.keyCode) {
    case 27:  // esc
      if (this._inputElemHasFocus) {
        if (this._currentInputValue) {
          this._currentInputValue = '';
          this._$inputElem.val(this._currentInputValue);
        } else {
          this._$inputElem.val('');
        }
      }
      break;
    case 38:  // up
      e.preventDefault();
      this._selectPreviousItem();
      break;
    case 40:  // down
      e.preventDefault();
      this._selectNextItem();
      break;
    case 13:  // return
      if (this._inputElemHasFocus && this._currentInputValue) {
        if (this._getSelectedItem()) {
          this._onSuggestionPick();
        } else if (this._searchURIPrefix) {
          // perform search
          document.location.href = this._searchURIPrefix + this._currentInputValue;
        } else {
          this._onSuggestionPick();
        }
      }
      break;
    default:
      if (e.target.value == this._currentInputValue) return;
      this._currentInputValue = e.target.value;
      if (!this._currentInputValue) {
        this._toggleSuggestionList(false);
      } else if (this._isValidSearchSuggestQuery(this._currentInputValue)) {
        this._doSearchSuggest(this._currentInputValue);
      } else {
        this._$suggestionListItems = null;
        this._toggleSuggestionList(false);
      }
  }
};

CoffeeSuggest.prototype._onSuggestionPick = function() {
  // in case no suggestion is selected (most likely because result was empty)
  // in case no suggestion is selected (most likely because result was empty)
  // - send current input value as argument to callback
  var arg = this._getSelectedItem()
    ? this._getSelectedItem().JSONData
    : this._currentInputValue;

  this._onSuggestionPickCallback(arg);
};

CoffeeSuggest.prototype._isValidSearchSuggestQuery = function(query) {
  return query.length > 1;
};

CoffeeSuggest.prototype._doSearchSuggest = function(query) {
  if (typeof this._onSearchStartCallback === 'function')
    this._onSearchStartCallback();

  this._unbindSuggestionListItemEvents();

  $.ajax({
    url: this._ajaxSearchURIPrefix + query,
    type: 'GET',
    dataType: 'json',
    success: $.proxy(this._onSearchSuggestComplete, this),
    error: $.proxy(this._onSearchSuggestError, this)
  });
};

CoffeeSuggest.prototype._onSearchSuggestComplete = function(loadedData) {
  if (typeof this._onSearchEndCallback === 'function')
    this._onSearchEndCallback();

  this._$suggestionListContainer.find('.js-header, .js-list').remove();
  this._$suggestionListItems = null;

  var
    scope = this,
    suggestionItems = loadedData,//this._groupSearchSuggestResults(loadedData),
    currentSuggestionItemIndex = 0,
    addSuggestions = function(items) {
      if (items.length === 0) {
        scope._toggleSuggestionList(false);
        return;
      } else {
        scope._toggleSuggestionList(true);
      }

      if (items[0] instanceof Array) {
        $.each(items, function(i, itemGroup) {
          if (!(itemGroup instanceof Array) || !itemGroup.length) return;
          scope._addSuggestionListItemHeader(i);
          addSuggestions.call(scope, itemGroup);
        });
        return;
      }

      var $suggestionList = scope._constructSuggestionList();
      $.each(items, $.proxy(function(i, item) {
        var
          $listItem = scope._constructSuggestionListItem(),
          url = scope._getURIForSuggestion(item),
          label = scope._highlightCurrentQueryInSuggestion(item),
          listItemContent = '<a href="'+url+'">' + label + '</a>';

        $listItem.html(listItemContent);
        if (typeof scope._listItemFormatter === 'function') $listItem = scope._listItemFormatter($listItem, item);
        $listItem[0].JSONData = item;
        $listItem[0].listIndex = currentSuggestionItemIndex++;

        $suggestionList.append($listItem);
      }, this));
      scope._$suggestionListContainer.children('.js-inner').append($suggestionList);
    };

  addSuggestions(loadedData);
  scope._$suggestionListItems = scope._$suggestionListContainer.find('.js-item').not('.js-unselectable');

  scope._bindSuggestionListItemEvents();
};

CoffeeSuggest.prototype._onSearchSuggestError = function(a, b, c) {
  if (typeof this._onSearchEndCallback === 'function')
    this._onSearchEndCallback();
};

/**
 * @function groupSearchSuggestResults
 * @param array results
 * This method works in two ways:
 * - If `results` itself consists of "sub collections" it adds a label for each of them,
 *   based on their index and `this._suggestionListGroupLabels`
 * - Otherwise it just returns `results` unchanged
 */
CoffeeSuggest.prototype._groupSearchSuggestResults = function(results) {
  // group e.g. authors, titles
  var items = { titles: [], authors: [] };

  $.each(results, function(i, item) {
    results[i].groupLabel = this._suggestionListGroupLabels[i];
  });
  return items;
};

CoffeeSuggest.prototype._getSelectedItem = function() {
  if (!this._hasSuggestions()) return null;

  return this._$suggestionListItems.filter('.'+this.SELECTED_ITEM_IDENTIFIER)[0];
};

CoffeeSuggest.prototype._getListItemAtIndex = function(index) {
  if (!this._hasSuggestions()) return null;

  if (index < 1)
    index = this._$suggestionListItems.length + index;
  if (index >= this._$suggestionListItems.length)
    index = 0;

  return this._$suggestionListItems[index];
};

CoffeeSuggest.prototype._selectItemAtIndex = function(index) {
  if (!this._hasSuggestions()) return null;

  this._$suggestionListItems.removeClass(this.SELECTED_ITEM_IDENTIFIER);
  selectedItem = this._$suggestionListItems.eq(index).addClass(this.SELECTED_ITEM_IDENTIFIER);

  if (!this._itemIsSelectable(selectedItem))
    return this._selectNextItem();

  return selectedItem;
};

CoffeeSuggest.prototype._unselectItemAtIndex = function(index) {
  if (!this._hasSuggestions()) return;

  selectedItem = this._$suggestionListItems.eq(index).removeClass(this.SELECTED_ITEM_IDENTIFIER);
};

CoffeeSuggest.prototype._selectNextItem = function() {
  if (!this._hasSuggestions()) return null;

  var
    selectedItem = this._getSelectedItem(),
    nextItem = this._getListItemAtIndex(selectedItem ? selectedItem.listIndex+1 : 0);

  this._$suggestionListItems.removeClass(this.SELECTED_ITEM_IDENTIFIER);
  $(nextItem).addClass(this.SELECTED_ITEM_IDENTIFIER);

  if (!this._itemIsSelectable(nextItem))
    return this._selectNextItem();

  return nextItem;
};

CoffeeSuggest.prototype._selectPreviousItem = function() {
  if (!this._hasSuggestions()) return null;

  var
    selectedItem = this._getSelectedItem(),
    previousItem = this._getListItemAtIndex(selectedItem ? selectedItem.listIndex-1 : 0);

  this._$suggestionListItems.removeClass(this.SELECTED_ITEM_IDENTIFIER);
  $(previousItem).addClass(this.SELECTED_ITEM_IDENTIFIER);

  if (!this._itemIsSelectable(previousItem))
    return this._selectPreviousItem();

  return previousItem;
};

CoffeeSuggest.prototype._itemIsSelectable = function(item) {
  return !$(item).hasClass('js-unselectable');
};

CoffeeSuggest.prototype._highlightCurrentQueryInSuggestion = function(JSONData) {
  var label = this._getLabelForSuggestion(JSONData);
  return label.replace(new RegExp(this._currentInputValue, 'gi'), '<span class="highlight">'+"$&"+'</span>');
  return '';
};

CoffeeSuggest.prototype._toggleSuggestionList = function(show) {
  if (show) this._$suggestionListContainer.removeClass('hide');
  else this._$suggestionListContainer.addClass('hide');
};

CoffeeSuggest.prototype._getLabelForSuggestion = function(JSONData) {
  if (typeof this._getSuggestionLabelFunction === 'function')
    return this._getSuggestionLabelFunction(JSONData);
  else if (typeof JSONData === 'string')
    return JSONData;
  else if ('title' in JSONData)
    return JSONData.title;
  else if ('name' in JSONData)
    return JSONData.name;
  else if ('label' in JSONData)
    return JSONData.label;
  else if ('text' in JSONData)
    return JSONData.text;
  else
    return '';
}

CoffeeSuggest.prototype._getURIForSuggestion = function(JSONData) {
  if (typeof this._getSuggestionURIFunction === 'function')
    return this._getSuggestionURIFunction(JSONData);
  else if ('uri' in JSONData)
    return JSONData.uri;
  else if ('permalink' in JSONData)
    return JSONData.permalink;
  return '';
};

CoffeeSuggest.prototype._addSuggestionListItemHeader = function(listGroupIndex) {
  var $itemHeader = this._constructSuggestionListItemHeader();
  $itemHeader.children('.js-inner').html(this._suggestionListGroupLabels[listGroupIndex]);
  this._$suggestionListContainer.children('.js-inner').append($itemHeader);
};

CoffeeSuggest.prototype._hasSuggestions = function() {
  return (this._$suggestionListItems && this._$suggestionListItems.length);
};

CoffeeSuggest.prototype._constructSuggestionListContainerElement = function() {
  return $(this.SUGGESTION_LIST_CONTAINER_MARKUP);
};

CoffeeSuggest.prototype._constructSuggestionList = function() {
  return $(this.SUGGESTION_LIST_MARKUP);
};

CoffeeSuggest.prototype._constructSuggestionListItem = function() {
  return $(this.SUGGESTION_LIST_ITEM_MARKUP);
};

CoffeeSuggest.prototype._constructSuggestionListItemHeader = function() {
  return $(this.SUGGESTION_LIST_ITEM_HEADER_MARKUP);
};

/********************************************************************************************
 * Public Methods
 ********************************************************************************************/
CoffeeSuggest.prototype.setOffset = function(direction, value) {
  var numberValue = parseInt(value, 10);
  if (!numberValue) return;
  this._$suggestionListContainer.css('position', 'absolute');
  switch (direction) {
    case 'top':
      this._$suggestionListContainer.css('top', value+'px');
      break;
    case 'right':
      this._$suggestionListContainer.css('right', value+'px');
      break;
    case 'bottom':
      this._$suggestionListContainer.css('bottom', value+'px');
      break;
    case 'left':
      this._$suggestionListContainer.css('left', value+'px');
  }
};

CoffeeSuggest.prototype.reset = function() {
  this._$inputElem.val('');
  this._toggleSuggestionList(false);
};
