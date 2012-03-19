/**
 * @param DOMElement/jQuery $inputElem
 * @param string ajaxSearchURIPrefix
 * @param string searchURIPrefix
 * @param array suggestionListGroupLabels
 * @param string suggestionListLabel General label for entire collection, e.g. "Suggestions"
 */
CoffeeSuggest = function($inputElem, ajaxSearchURIPrefix, searchURIPrefix, suggestionListGroupLabels, suggestionListLabel) {
	// statics
	this.SELECTED_ITEM_IDENTIFIER        = 'selected';
	this.SUGGESTION_LIST_CONTAINER_MARKUP  = '<div class="js-search-suggestions mod search-suggestions hide"><div class="js-inner inner clearfix"><div class="inner-right label-small light-grey">'+suggestionListLabel||'Suggestions'+'</div></div></div>';
	this.SUGGESTION_LIST_MARKUP           = '<ul class="js-list list clearfix"></ul>';
	this.SUGGESTION_LIST_ITEM_MARKUP       = '<li class="js-item item"></li>';
	this.SUGGESTION_LIST_ITEM_HEADER_MARKUP = '<div class="js-unselectable js-header item header bold uppercase light-grey"><span class="js-inner inner"></span></div>';

  this._ajaxSearchURIPrefix            = ajaxSearchURIPrefix;
  this._searchURIPrefix                = searchURIPrefix;
  this._suggestionListGroupLabels      = suggestionListGroupLabels;
	this._$inputElem                     = ($inputElem instanceof jQuery) ? $inputElem.eq(0) : $(inputElem);
	this._inputHasFocus                  = false;
	this._currentInputValue              = this._$inputElem.val();
	this._suggestionListContainer        = null;
	this._suggestionListItems            = [];

	if (!this._suggestionListContainer) {
		this._suggestionListContainer = this._constructSuggestionListContainerElement();
		this._$inputElem.parent().parent().append(this._suggestionListContainer);
	}
	
	this._$inputElem
		.on('focus', $.proxy(this._onFocus, this))
		.on('blur', $.proxy(this._onBlur, this))
		.on('keyup', $.proxy(this._onKeyUp, this));
};

CoffeeSuggest.prototype._onFocus = function(e) {
	this._inputHasFocus = true;
	if (this._suggestionListItems && this._suggestionListItems.length && this._suggestionListContainer) {
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
		case 27:	// esc
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
		case 38:	// up
			e.preventDefault();
			this._selectPreviousItem();
			break;
		case 40:	// down
			e.preventDefault();
			this._selectNextItem();
			break;
		case 13:	// return
			if (this._inputHasFocus && this._currentInputValue) {
				var goToURI = '';
				if (this._getSelectedItem()) {
					// go to selected entity
					goToURI = this._getURLForSuggestion(this._getSelectedItem().JSONData);
				} else {
					// perform search
					goToURI = this._searchURIPrefix + this._currentInputValue;
				}
				document.location.href = goToURI;
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
				this._suggestionListItems = null;
				this._toggleSuggestionList(false);
			}
	}
};

CoffeeSuggest.prototype._isValidSearchSuggestQuery = function(query) {
	return query.length > 2;
};

CoffeeSuggest.prototype._doSearchSuggest = function(query) {
  $.ajax({
    url: this._ajaxSearchURIPrefix + query,
    type: 'GET',
    dataType: 'json',
    data: 'query=' + query,
    success: this._onSearchSuggestComplete,
    error: this._onSearchSuggestError
  });
};

CoffeeSuggest.prototype._onSearchSuggestComplete = function(loadedData) {
	console.log('onSearchSuggestComplete: ', loadedData);
	this._suggestionListContainer.find('.js-header, .js-list').remove();
	this._suggestionListItems = null;

	var
		suggestionItems = this._groupSearchSuggestResults(loadedData),
		currentSuggestionItemIndex = 0,
    addSuggestions = function(items) {
      if (suggestionItems instanceof Array) {
        $.each(suggestionItems, function(i, itemGroup) {
          addSuggestions(itemGroup);
        });
        return;
      }
      var suggestionList = this._constructSuggestionList();
      this._addSuggestionListItemHeader(suggestionItems);
      $.each(suggestionItems, $.proxy(function(i, item) {
        var
          url = this._getURLForSuggestion(item),
          text = this._highlightCurrentQueryInString(item.title),
          listItemContent = '<a class="inner" href="'+url+'">'+text+'</a>',
          listItem = this._constructSuggestionListItem();
          listItemInner = listItem.html(listItemContent);
        listItem[0].JSONData = item;
        listItem[0].listIndex = currentSuggestionItemIndex++;
        suggestionList.append($(listItem));
        this._toggleSuggestionList(true);
      }, this));
      this._suggestionListContainer.children('.js-inner').append(suggestionList);
    };
	this._suggestionListItems = this._suggestionListContainer.find('.js-item').not('.js-unselectable');
};

CoffeeSuggest.prototype._onSearchSuggestError = function(a, b, c) {
	console.log('onSearchSuggestError: ', a, b, c);
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
	return this._suggestionListItems.filter('.'+this.SELECTED_ITEM_IDENTIFIER)[0];
};

CoffeeSuggest.prototype._getListItemAtIndex = function(index) {
	if (index < 1)
		index = this._suggestionListItems.length + index;
	if (index >= this._suggestionListItems.length)
		index = 0;
	return this._suggestionListItems[index];
};

CoffeeSuggest.prototype._selectNextItem = function() {
	var
		selectedItem = this._getSelectedItem(),
		nextItem = this._getListItemAtIndex(selectedItem ? selectedItem.listIndex+1 : 0);

	this._suggestionListItems.removeClass(this.SELECTED_ITEM_IDENTIFIER);
	$(nextItem).addClass(this.SELECTED_ITEM_IDENTIFIER);

	if (!this._itemIsSelectable(nextItem))
		return this._selectNextItem();
	return nextItem;
};

CoffeeSuggest.prototype._selectPreviousItem = function() {
	var
		selectedItem = this._getSelectedItem(),
		previousItem = this._getListItemAtIndex(selectedItem ? selectedItem.listIndex-1 : 0);

	this._suggestionListItems.removeClass(this.SELECTED_ITEM_IDENTIFIER);
	$(previousItem).addClass(this.SELECTED_ITEM_IDENTIFIER);

	if (!this._itemIsSelectable(previousItem))
		return this._selectPreviousItem();
	return previousItem;
};

CoffeeSuggest.prototype._itemIsSelectable = function(item) {
	return !$(item).hasClass('js-unselectable');
};

CoffeeSuggest.prototype._highlightCurrentQueryInString = function(string) {
  return string.replace(new RegExp(this._currentInputValue, 'gi'), '<span class="highlight">'+"$&"+'</span>');
};

CoffeeSuggest.prototype._addSuggestionListItemHeader = function(listGroupIndex) {
	var itemHeader = this._constructSuggestionListItemHeader();
	itemHeader.children('.js-inner').html(listGroupIndex);
	this._suggestionListContainer.children('.js-inner').append(itemHeader);
};

CoffeeSuggest.prototype._toggleSuggestionList = function(show) {
	var el = this._suggestionListContainer;
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

CoffeeSuggest.prototype._getURLForSuggestion = function(itemData) {
  if ('uri' in itemData) return itemData.uri;
  return '';
};
