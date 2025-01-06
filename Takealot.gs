/**
 * Trigger GET Takealot Sales call every minute. 
 * 
 * Max trigger time 90min/day.
 * 
 * Expecting response in the format:
 * 
 * {
      "page_summary": {
          "total": 1,
          "page_size": 100,
          "page_number": 1
      },
      "sales": [
          {
              "order_item_id": 145628729,
              "order_id": 94490206,
              "order_date": "01 Oct 2021 13:47:32",
              "sale_status": "Shipped to Customer",
              "offer_id": 106715933,
              "tsin": 76786306,
              "sku": "9901067159339",
              "product_title": "Leather Desk Mat Mouse Pad - Light Blue",
              "takealot_url_mobi": "https://www.takealot.com/x/PLID73129306",
              "selling_price": 399.0,
              "quantity": 1,
              "dc": "JHB",
              "customer": "Thomas Hilmer",
              "takealot_url": "https://www.takealot.com/x/PLID73129306"
          }
      ]
    }
 */
function getSales() {
  const response = fetchSalesData()

  const page_summary = response.page_summary
  const sales = response.sales
  const new_total = page_summary.total

  // See if I need to update sales table - maybe try getValues() into comparing their string formats.
  const ss = SpreadsheetApp.openByUrl("https://docs.google.com/spreadsheets/d/1lU2aAv2Nv34ZMKkPFEBUgGS1HJPtNqQDkYrxFRQK4aA/edit")
  const previous_total = ss.getSheetByName('Fetch Stats').getRange('B1').getValue();

  const sales_sheet = ss.getSheetByName('Sales')
  const previous_data = sales_sheet.getDataRange().getValues()
  // const new_data = listSalesTo2DArray(sales)
  //split header and data

  //figure out sales item with the most keys.
  var longestLength = 0
  var longestIndex = 0;
  sales.forEach((currValue, currIndex) => {
    const newLength = Object.keys(currValue).length
    if (newLength > longestLength) {
      longestLength = newLength
      longestIndex = currIndex
    }
  })

  const new_headers = Object.keys(sales[longestIndex])
  previous_data.shift()
  // in case of new headers, update to a quiet channel...
  const new_data_map = listSalesToMap(sales)
  const old_data_map = twoDToMap(previous_data, new_headers)

  Logger.log("new_data_map")
  Logger.log(new_data_map)
  Logger.log("old_data_map")
  Logger.log(old_data_map)

  const new_sales = [];
  const status_updates = [];
  const existing_order_updates = [];

  // check for differences between new and old data
  Object.entries(new_data_map).forEach(([orderKey, orderKeyObj], orderKeyIndex) => {
    if (orderKey in old_data_map) {
      // order already existed, check if all items are there
      Object.entries(orderKeyObj).forEach(([orderItemKey, orderItemKeyObj]) => {
        if (orderItemKey in old_data_map[orderKey]) {
          //just check if there are any updates to sale_status
          if (orderItemKeyObj.sale_status !== old_data_map[orderKey][orderItemKey].sale_status) {
            status_updates.push(orderItemKeyObj)
          }
        } else {
          //new order item. very rare tho.
          existing_order_updates.push(orderItemKeyObj)
        }
      })
    } else {
      // need to add all to new_sales
      Object.entries(orderKeyObj).forEach(([orderItemKey, orderItemKeyObj]) => {
        new_sales.push(orderItemKeyObj)
      })
    }
  })

  new_sales.forEach((new_sale) => {
    const slack_url = "https://hooks.slack.com/services/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"
    const body = {
      text: newSalesMsg(new_sale)
    }
    const payload = JSON.stringify(body)
    const options = {
      method: "POST",
      contentType: "application/json",
      payload: payload
    }
    UrlFetchApp.fetch(slack_url, options)

  })

  status_updates.forEach((sales_update) => {
    const slack_url = "https://hooks.slack.com/services/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"
    const body = {
      text: statusUpdateMsg(sales_update)
    }
    const payload = JSON.stringify(body)
    const options = {
      method: "POST",
      contentType: "application/json",
      payload: payload
    }
    UrlFetchApp.fetch(slack_url, options)
  })

  existing_order_updates.forEach((order_item_update) => {
    const slack_url = "https://hooks.slack.com/services/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"
    const body = {
      text: orderItemUpdateMsg(order_item_update)
    }
    const payload = JSON.stringify(body)
    const options = {
      method: "POST",
      contentType: "application/json",
      payload: payload
    }
    UrlFetchApp.fetch(slack_url, options)
  })

  if (status_updates.length > 0 || new_sales.length > 0 || existing_order_updates.length > 0) {
    //rewrite sheet
    ss.getSheetByName('Fetch Stats').getRange('B1').setValue(sales.length)
    //convert sales to 2d array.
    ss.getSheetByName('Sales').getRange(1, 1, sales.length+1, new_headers.length).setValues(listSalesTo2DArray(sales, longestIndex, longestLength))

    //update all_sales_spreadsheet
    if (new_sales.length > 0) {
      const all_sales_spreadsheet_url = "https://docs.google.com/spreadsheets/d/1rMkN6LnhAzh4ePtHfZhWcFhIIHdnD6u3ozt2kNmZxHc/edit"
      const all_sales_ss = SpreadsheetApp.openByUrl(all_sales_spreadsheet_url)
      const all_sales_sheet = all_sales_ss.getSheets()[0]
      new_sales.forEach((new_sale) => {
        all_sales_sheet.appendRow(Object.values(new_sale))
      })
    }
  } else {
    Logger.log("No updates")
  }

}

// still need to do paginated calls to get all the data.
function fetchSalesData() {
  //https://seller-api.takealot.com/v2/sales?page_number=1&page_size=100
  const url = "https://seller-api.takealot.com/v2/sales"
  const auth_key =          "b87d2381dd63fadab4d7e47faa8be890f8a9ee0152993df3e911fa60fa7412dc116ebbce378ce49827f9f205f8c022f4c3edfed5a5deaf18ab6ecf4183dd6725"
  const params = {
    "headers": {
      "Authorization": `Key ${auth_key}`
    }
  }

  const initial_response = JSON.parse(UrlFetchApp.fetch(url, params))
  const total_sales = initial_response.page_summary.total

  const max_pages = (total_sales/100) >> 0
  const last_page_size = total_sales%100

  const sales_data = {}
  sales_data.page_summary = initial_response.page_summary

  const all_sales = initial_response.sales

  for (let i = 2; i <= max_pages; i++) {
    // get next page and append to all_sales
    const page_url = `https://seller-api.takealot.com/v2/sales?page_number=${i}&page_size=100`
    const page_response = JSON.parse(UrlFetchApp.fetch(page_url, params))
    all_sales.concat(page_response.sales)
  }

  if (max_pages > 0) {
    const last_page_url = `https://seller-api.takealot.com/v2/sales?page_number=${max_pages+1}&page_size=${last_page_size}`
    const last_page_response = JSON.parse(UrlFetchApp.fetch(last_page_url, params))
    all_sales.concat(last_page_response.sales)
  }

  sales_data.sales = all_sales
  return sales_data
}

/**
 * 
 * {
      "page_summary": {
          "total": 1,
          "page_size": 100,
          "page_number": 1
      },
      "sales": [
          {
              "order_item_id": 145628729,
              "order_id": 94490206,
              "order_date": "01 Oct 2021 13:47:32",
              "sale_status": "Shipped to Customer",
              "offer_id": 106715933,
              "tsin": 76786306,
              "sku": "9901067159339",
              "product_title": "Leather Desk Mat Mouse Pad - Light Blue",
              "takealot_url_mobi": "https://www.takealot.com/x/PLID73129306",
              "selling_price": 399.0,
              "quantity": 1,
              "dc": "JHB",
              "customer": "Thomas Hilmer",
              "takealot_url": "https://www.takealot.com/x/PLID73129306"
          }
      ]
    }
 */
function listSalesTo2DArray(sales, longestIndex, longestLength){
  //normalize all sales to the same number of coloumns
  const normSales = sales.map((val, index) => {
    const itemLength = Object.keys(val).length
    if (itemLength < longestLength) {
      const diff = longestLength - itemLength
      for (i=0;i<diff;i++) {
        const key = "key"+i
        val[key] = ""
      }
    }
    return val
  })

  // push headings into array
  var table = []
  table.push(Object.keys(sales[longestIndex]))

  // push sales data into array
  normSales.map(sale => {
    table.push(Object.values(sale))
  })

  return table
}

/**
 * Key on "order_item_id": 145628729,
            "order_id": 94490206,

            returns a map in the format:
            {
              order_item_id: {
                order_id: {
                  sales obj
                }
              }
            }
 */
function listSalesToMap(sales) {
  const salesMap = {}
  sales.reduce((prevValue, currValue) => {
    const order_key = currValue.order_id
    const order_item_key = currValue.order_item_id

    if (prevValue[order_key] == null) {
      prevValue[order_key] = {}
    }
    prevValue[order_key][order_item_key] = currValue

    return prevValue
  }, salesMap)
  return salesMap
}

/**
 * 2D array to map.
 * 
 * Key on "order_item_id": 145628729,
            "order_id": 94490206,

            returns a map in the format:
            {
              order_item_id: {
                order_id: {
                  sales obj
                }
              }
            }
 */
function twoDToMap(sheetsData, objValues) {
  const salesMap = {}
  sheetsData.reduce((prevValue, currValue) => {
    const objCurrValue = salesListToObj(currValue, objValues)
    const order_key = objCurrValue.order_id
    const order_item_key = objCurrValue.order_item_id

    if (prevValue[order_key] == null) {
      prevValue[order_key] = {}
    }
    prevValue[order_key][order_item_key] = objCurrValue

    return prevValue
  }, salesMap)
  return salesMap
}

/**
 * [] -> {}
 */
function salesListToObj(lSales, objValues) {
  const newSales = {}
  lSales.forEach((value, index) => {
    newSales[objValues[index]] = value
  })
  return newSales
}

function newSalesMsg(new_sale) {
  return `<!here> Sold ${new_sale.quantity} ${new_sale.product_title} to ${new_sale.customer}` 
            + ` for R${new_sale.selling_price}! Shipping from ${new_sale.dc} DC :airplane:`
}

function statusUpdateMsg(sale_update) {
  return `<!here> Order to ${sale_update.customer} has *${sale_update.sale_status}*!`
            + ` This was for ${sale_update.quantity} ${sale_update.product_title} from ${sale_update.dc} DC :factory:`
}

function orderItemUpdateMsg(item_update) {
  return `<!here> New order item [${item_update.order_item_id}] for order [${item_update.order_id}]`
            + ` to ${item_update.customer} with status [*${item_update.sale_status}*] was found.`
            + ` This was for ${item_update.quantity} ${item_update.product_title} from ${item_update.dc} DC :mag:`
}


