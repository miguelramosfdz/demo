var app = angular.module('pelias', []);
var hash_params = L.Hash.parseHash(location.hash);

app.run(function($rootScope) {
  var hash_loc = hash_params ? hash_params : {'center': {'lat': 40.7259, 'lng': -73.9805}, 'zoom': 12};
  $rootScope.geobase = {
    'zoom': hash_loc.zoom,
    'lat' : hash_loc.center.lat,
    'lon' : hash_loc.center.lng
  }
  $(document).on('new-location', function(e){
    $rootScope.geobase = {
      'zoom': e.zoom,
      'lat' : e.lat,
      'lon' : e.lon
    };
  })
});

app.controller('SearchController', function($scope, $rootScope, $sce, $http) {
    // --------- suggestions ---------
  var map = L.map('map', {
      zoom: $rootScope.geobase.zoom,
      zoomControl: false,
      center: [$rootScope.geobase.lat, $rootScope.geobase.lon]
  });

  L.tileLayer('//{s}.tiles.mapbox.com/v3/randyme.i0568680/{z}/{x}/{y}.png', {
      attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="http://mapbox.com">Mapbox</a>',
      maxZoom: 18
  }).addTo(map);
  new L.Control.Zoom({ position: 'topright' }).addTo(map);
  L.control.locate({ position: 'topright', keepCurrentZoomLevel: true }).addTo(map);
  L.control.locations({ position: 'topright', keepCurrentZoomLevel: true }).addTo(map);
  // Set up the hash
  var hash = new L.Hash(map);
  var marker;

  $rootScope.$on( 'map.setView', function( ev, geo, zoom ){
    map.setView( geo, zoom || 8 );
  });

  $rootScope.$on( 'map.dropMarker', function( ev, geo, text, icon_name ){
    marker = new L.marker(geo, {icon: L.AwesomeMarkers.icon(
      {icon: icon_name,  prefix: 'glyphicon', markerColor: 'green'}) }).bindPopup(text);
    map.addLayer(marker);
    marker.openPopup();
  });

  $rootScope.$on( 'map.dropGeoJson', function( ev, data ){
    var geoJsonLayer = L.geoJson(data, {
      onEachFeature: function (feature, layer) {
        layer.bindPopup(feature.properties.text);
      }
    }).addTo(map);
    geoJsonLayer.addData(data);
  });
  
  $rootScope.$on( 'map.removeAllMarkers', function( ev, geo, text ){
    if (marker) {
      map.removeLayer(marker);
    }
  });

  $rootScope.$on( 'fullTextSearch', function( ev, text ){
    $(document).trigger({
      'type': "pelias:fullTextSearch",
      'text' : text
    });    
  });

  map.on('click', function(e) {
    var geo = {
      'lat': e.latlng.lat,
      'lon': e.latlng.lng
    };
    reverse(geo);
  });

  var highlight = function( text, focus ){
    var r = RegExp( '('+ focus + ')', 'gi' );
    return text.replace( r, '<strong>$1</strong>' );
  }

  var icon = function( type ){
    if( type.match('geoname') ){
      return 'screenshot';
    } else if( type.match('osm') ){
      return 'globe';
    } else if( type.match('admin0') ){
      return 'flag';
    } else if( type.match('admin') ){
      return 'tower';
    } else if( type.match('neighborhood') ){
      return 'home';
    } else if( type.match('search') ){
      return 'search';
    }
    return 'map-marker';
  };

  var resultSelected = function(search, geo, changeQuery) {
    $rootScope.$emit( 'map.removeAllMarkers' );
    if (changeQuery) {
      $scope.search = search;  
      $rootScope.$emit( 'hideall' );
    }
    $rootScope.$emit( 'map.setView', geo.reverse(), $rootScope.geobase.zoom );
    $rootScope.$emit( 'map.dropMarker', geo, search, 'search');
  };

  var computeDistance = function(geo) {
    var p1 = new LatLon( $rootScope.geobase.lat, $rootScope.geobase.lon );
    var p2 = new LatLon( geo[1], geo[0] );
    var distance = Number( p1.distanceTo(p2) );
    return distance.toFixed( distance < 1 ? 2 : 0 );
  }

  var reverse = function(geo) {
    $http({
      url: $scope.api_url+'/reverse',
      method: 'GET',
      params: {
        lat: geo.lat,
        lon: geo.lon,
        zoom:$rootScope.geobase ? $rootScope.geobase.zoom : 12
      }, 
      headers: { 'Accept': 'application/json' }
    }).success(function (data, status, headers, config) {
      if (data) {
        var geo = data.features[0].geometry.coordinates;
        var txt = data.features[0].properties.text;
        $rootScope.$emit( 'map.setView', geo.reverse(), $rootScope.geobase.zoom );
        $rootScope.$emit( 'map.dropMarker', geo, txt, 'star');
      } else { }
    })
  };

  var getResults = function(url, resultkey) {
    $http({
      url: $scope.api_url+url,
      method: 'GET',
      params: {      
        input: $scope.search,
        // datasets: $scope.queryDatasets.join(','),
        lat: $rootScope.geobase ? $rootScope.geobase.lat : 0,
        lon: $rootScope.geobase ? $rootScope.geobase.lon : 0,
        zoom:$rootScope.geobase ? $rootScope.geobase.zoom : 12,
        size: 10
      },
      headers: { 'Accept': 'application/json' }
    }).success(function (data, status, headers, config) {
      if( data ){
        if (resultkey=='searchresults') {
          $rootScope.$emit( 'map.dropGeoJson', data );
        }
        $scope[resultkey].length = 0;
        $scope[resultkey] = data.features.map( function( res ){
          res.htmltext = $sce.trustAsHtml(highlight( res.properties.text, $scope.search ));
          res.icon = icon( res.properties.type || 'search' );
          res.distance = computeDistance(res.geometry.coordinates);
          return res;
        });
      }
      else {
        $scope[resultkey] = [];
      }
    }).error(function (data, status, headers, config) {
      $scope[resultkey] = [];
    });
  };

  $scope.search = '';
  $scope.searchresults = [];
  $scope.suggestresults = [];
  $scope.api_url = '//54.164.17.151:8080';

  $scope.selectResult = function( result, changeQuery ){
    resultSelected(result.properties.text, result.geometry.coordinates, changeQuery)
  }

  $rootScope.$on( 'hideall', function( ev ){
    $scope.suggestresults = [];
    $scope.searchresults = []
  });

  $rootScope.$on( 'hidesuggest', function( ev ){
    $scope.suggestresults = [];
  });

  $rootScope.$on( 'hidesearch', function( ev ){
    $scope.searchresults = [];
  });

  $scope.keyPressed = function(ev) {
    if (ev.which == 13) {
      $("#suggestresults").addClass("smaller");
      $scope.fullTextSearch();
    } else {
      $("#suggestresults").removeClass("smaller");
      $rootScope.$emit('hidesearch');
    }
  }

  $scope.onFocus = function(ev) {
    // $("#searchresults").removeClass("smaller");
  }

  $scope.onBlur = function(ev) {
    // $("#searchresults").addClass("smaller");
  }

  $scope.suggest = function(){
    
    if( !$scope.search.length ) {
      $rootScope.$emit( 'hideall' );
      return;
    }
    
    getResults('/suggest', 'suggestresults');
  }

  $scope.fullTextSearch = function(){
    
    if( !$scope.search.length ) {
      $rootScope.$emit( 'hideall' );
      return;
    }
    $rootScope.$emit('fullTextSearch', $scope.search);
    getResults('/search', 'searchresults');
  }

  $scope.$watch( 'search', function( input ){
    $scope.suggest();
  });

  // faking a search when query params are present
  var hash_query  = hash_params ? hash_params.q : false;
  if (hash_query){
    $scope.search = hash_query
    $scope.keyPressed({ 'which': 13});
  }
    
  $(document).on('new-location', $scope.suggest);
})
