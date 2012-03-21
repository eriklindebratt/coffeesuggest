/**
 * @param DOMElement/jQuery $inputElem
 * @param string ajaxSearchURIPrefix Used when querying server for suggestions corresponding to "'ajaxSearchURIPrefix' + query"
 * @param function onSuggestionChoiceCallback Fired when user picks a suggestion
 * @param array suggestionListGroupLabels [optional]
 * @param function getSuggestionLabelFunction [optional] When set, this method will be called with item's complete data object to get its "label" value back
 * @param string searchURIPrefix [optional] When set, and user submits the input element (e.g. presses "return" key when input is focused) and no suggestion (if any) is selected, user will be redirected to "'searchURIPrefix' + query"
 * @param function getSuggestionURIFunction [optional] When set, this method will be called with item's complete data object to get its "URI" value back
 * @param string suggestionListLabel [optional] General label for entire collection, e.g. "Suggestions"
 * @param function onSearchStartCallback [optional]
 * @param function onSearchEndCallback [optional]
 */
CoffeeSuggest = function($inputElem, ajaxSearchURIPrefix, onSuggestionChoiceCallback, suggestionListGroupLabels, getSuggestionLabelFunction, searchURIPrefix, getSuggestionURIFunction, suggestionListLabel, onSearchStartCallback, onSearchEndCallback) {
  // statics
  this.SELECTED_ITEM_IDENTIFIER        = 'selected';
  this.SUGGESTION_LIST_CONTAINER_MARKUP  = '<div class="js-search-suggestions search-suggestions hide"><div class="js-inner inner clearfix"><div class="inner-right label-small light-grey">'+suggestionListLabel||'Suggestions'+'</div></div></div>';
  this.SUGGESTION_LIST_MARKUP           = '<ul class="js-list list clearfix"></ul>';
  this.SUGGESTION_LIST_ITEM_MARKUP       = '<li class="js-item item"></li>';
  this.SUGGESTION_LIST_ITEM_HEADER_MARKUP = '<div class="js-unselectable js-header item header bold uppercase light-grey"><span class="js-inner inner"></span></div>';

  this._$inputElem                     = ($inputElem instanceof jQuery) ? $inputElem.eq(0) : $(inputElem);
  this._ajaxSearchURIPrefix            = ajaxSearchURIPrefix;
  this._onSuggestionChoiceCallback     = onSuggestionChoiceCallback;
  this._suggestionListGroupLabels      = suggestionListGroupLabels;
  this._getSuggestionLabelFunction     = getSuggestionLabelFunction
  this._searchURIPrefix                = searchURIPrefix;
  this._onSearchStartCallback          = onSearchStartCallback;
  this._onSearchEndCallback            = onSearchEndCallback;
  this._getSuggestionURIFunction       = getSuggestionURIFunction
  this._inputHasFocus                  = false;
  this._currentInputValue              = this._$inputElem.val();
  this._$suggestionListContainer       = null;
  this._$suggestionListItems           = [];

  if (!this._$inputElem.length) {
    console.error('CoffeeSuggest: Invalid value for @param "$inputElem"');
    return null;
  }
  if (typeof this._ajaxSearchURIPrefix !== 'string') {
    console.error('CoffeeSuggest: Invalid value for @param "ajaxSearchURIPrefix"');
    return null;
  }
  if (typeof this._onSuggestionChoiceCallback !== 'function') {
    console.error('CoffeeSuggest: Invalid value for @param "onSuggestionChoiceCallback"');
    return null;
  }

  if (!this._$suggestionListContainer) {
    this._$suggestionListContainer = this._constructSuggestionListContainerElement();
    var $container = this._$inputElem.parents('.js-input-container').eq(0);
    if (!$container.length) {
      $container = this._$inputElem.parent().parent();
    }
    $container.append(this._$suggestionListContainer);
  }

  this._$inputElem
    .on('focus', $.proxy(this._onFocus, this))
    .on('blur', $.proxy(this._onBlur, this))
    .on('keyup', $.proxy(this._onKeyUp, this));

  $(this._$suggestionListContainer)
    .on('mouseover', '.item', function(e) {
      if ($(e.currentTarget).hasClass('.js-unselectable')) return;
      $(e.currentTarget)
        .addClass('selected')
        .siblings().removeClass('selected');
    })
    .on('mouseout', '.item', function(e) {
      if ($(e.currentTarget).hasClass('.js-unselectable')) return;
      $(e.currentTarget)
        .removeClass('selected')
        .siblings().removeClass('selected');
    });
};

CoffeeSuggest.prototype._onFocus = function(e) {
  this._inputHasFocus = true;
  if (this._$suggestionListItems && this._$suggestionListItems.length && this._suggestionListContainer) {
    this._toggleSuggestionList(true);
  }
};

CoffeeSuggest.prototype._onBlur = function(e) {
  setTimeout($.proxy(function() {
    this._inputHasFocus = false;
    if (this._suggestionListContainer) {
      this._toggleSuggestionList(false);
    }
  }, this), 200);
};

CoffeeSuggest.prototype._onKeyUp = function(e) {
  switch (e.keyCode) {
    case 27:  // esc
      // trigger blur
      if (this._inputHasFocus) {
        if (this._currentInputValue) {
          this._currentInputValue = '';
          this._$inputElem.val(this._currentInputValue);
        } else {
          this._$inputElem.blur();
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
      if (this._inputHasFocus && this._currentInputValue) {
        if (this._getSelectedItem()) {
          this._onSuggestionChoiceCallback(this._getSelectedItem().JSONData);
        } else if (this._searchURIPrefix) {
          // perform search
          alert(this._searchURIPrefix + this._currentInputValue);
          document.location.href = this._searchURIPrefix + this._currentInputValue;
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

CoffeeSuggest.prototype._isValidSearchSuggestQuery = function(query) {
  return query.length > 0;
};

CoffeeSuggest.prototype._doSearchSuggest = function(query) {
  if (typeof this._onSearchStartCallback === 'function')
    this._onSearchStartCallback();

  $.ajax({
    url: this._ajaxSearchURIPrefix + query,
    type: 'GET',
    dataType: 'json',
    data: 'query=' + query,
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
      if (items.length === 0) return;
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
          url = scope._getURIForSuggestion(item),
          label = scope._highlightCurrentQueryInSuggestion(item),
          listItemContent = '<a class="inner" href="'+url+'">' + label + '</a>',
          $listItem = scope._constructSuggestionListItem();
          listItemInner = $listItem.html(listItemContent);
        $listItem[0].JSONData = item;
        $listItem[0].listIndex = currentSuggestionItemIndex++;
        $suggestionList.append($listItem);
        scope._toggleSuggestionList(true);
      }, this));
      scope._$suggestionListContainer.children('.js-inner').append($suggestionList);
    };
  addSuggestions(loadedData);
  this._$suggestionListItems = this._$suggestionListContainer.find('.js-item').not('.js-unselectable');
};

CoffeeSuggest.prototype._onSearchSuggestError = function(a, b, c) {
  console.error('CoffeeSuggest: onSearchSuggestError: ', a, b, c);
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
  return this._$suggestionListItems.filter('.'+this.SELECTED_ITEM_IDENTIFIER)[0];
};

CoffeeSuggest.prototype._getListItemAtIndex = function(index) {
  if (index < 1)
    index = this._$suggestionListItems.length + index;
  if (index >= this._$suggestionListItems.length)
    index = 0;
  return this._$suggestionListItems[index];
};

CoffeeSuggest.prototype._selectNextItem = function() {
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

CoffeeSuggest.prototype._highlightCurrentQueryInSuggestion = function(itemData) {
  var label = this._getLabelForSuggestion(itemData);
  return label.replace(new RegExp(this._currentInputValue, 'gi'), '<span class="highlight">'+"$&"+'</span>');
  return '';
};

CoffeeSuggest.prototype._getLabelForSuggestion = function(itemData) {
  if (typeof this._getSuggestionLabelFunction === 'function')
    return this._getSuggestionLabelFunction(itemData);
  else if (typeof itemData === 'string')
    return itemData;
  else if ('title' in itemData)
    return itemData.title;
  else if ('name' in itemData)
    return itemData.name;
  else if ('label' in itemData)
    return itemData.label;
  else if ('text' in itemData)
    return itemData.text;
  else
    return '';
}

CoffeeSuggest.prototype._getURIForSuggestion = function(itemData) {
  if (typeof this._getSuggestionURIFunction === 'function')
    return this._getSuggestionURIFunction(itemData);
  else if ('uri' in itemData)
    return itemData.uri;
  else if ('permalink' in itemData)
    return itemData.permalink;
  return '';
};

CoffeeSuggest.prototype._addSuggestionListItemHeader = function(listGroupIndex) {
  var $itemHeader = this._constructSuggestionListItemHeader();
  $itemHeader.children('.js-inner').html(this._suggestionListGroupLabels[listGroupIndex]);
  this._$suggestionListContainer.children('.js-inner').append($itemHeader);
};

CoffeeSuggest.prototype._toggleSuggestionList = function(show) {
  var el = this._$suggestionListContainer;
  if (show) el.removeClass('hide');
  else el.addClass('hide');
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
